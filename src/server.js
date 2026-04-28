const path = require('node:path');
const express = require('express');

const { SIMULATED_CHARGE_POINT_IDENTITY } = require('./config/chargePoint');
const { createLogger } = require('./utils/logger');
const { getAdvertisedHost } = require('./utils/networkAddress');
const { ChargePointService } = require('./services/chargePointService');
const { createOcppServer } = require('./ocppServer');
const { createChargerRoutes } = require('./routes/chargerRoutes');

const HOST = process.env.HOST || '0.0.0.0';
const OCPP_PORT = Number(process.env.OCPP_PORT || 9220);
const API_PORT = Number(process.env.API_PORT || 3001);

async function bootstrap() {
  const logger = createLogger();
  const chargePointService = new ChargePointService(logger);

  const ocppServer = createOcppServer({
    logger,
    chargePointService,
    port: OCPP_PORT,
    host: HOST
  });

  await ocppServer.start();

  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(express.json());
  app.use('/chargers', createChargerRoutes({ chargePointService, logger }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      simulatedChargePointIdentity: SIMULATED_CHARGE_POINT_IDENTITY,
      connectedChargePoints: chargePointService.list()
    });
  });

  app.post('/start', async (req, res) => {
    try {
      const { identity, idTag, connectorId = 1 } = req.body || {};
      if (!identity || !idTag) {
        return res.status(400).json({
          error: 'identity and idTag are required'
        });
      }

      const response = await chargePointService.remoteStartTransaction(identity, {
        idTag,
        connectorId
      });

      return res.json({
        identity,
        action: 'RemoteStartTransaction',
        response
      });
    } catch (error) {
      logger.error('POST /start failed', { message: error.message });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/stop', async (req, res) => {
    try {
      const { identity, transactionId } = req.body || {};
      if (!identity || !transactionId) {
        return res.status(400).json({
          error: 'identity and transactionId are required'
        });
      }

      const response = await chargePointService.remoteStopTransaction(identity, {
        transactionId
      });

      return res.json({
        identity,
        action: 'RemoteStopTransaction',
        response
      });
    } catch (error) {
      logger.error('POST /stop failed', { message: error.message });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/reset', async (req, res) => {
    try {
      const { identity, type = 'Soft' } = req.body || {};
      if (!identity) {
        return res.status(400).json({
          error: 'identity is required'
        });
      }

      const response = await chargePointService.reset(identity, { type });
      return res.json({
        identity,
        action: 'Reset',
        response
      });
    } catch (error) {
      logger.error('POST /reset failed', { message: error.message });
      return res.status(500).json({ error: error.message });
    }
  });

  const apiAdvertised = getAdvertisedHost(HOST);
  app.listen(API_PORT, HOST, () => {
    logger.info(`HTTP API listening on http://${HOST}:${API_PORT} (reachable at http://${apiAdvertised}:${API_PORT})`);
    logger.info(
      'REST endpoints: POST /start, POST /stop, POST /reset, GET /health, GET /chargers/:id/config, GET /chargers/:id/config/:key, POST /chargers/:id/apply-config, POST /chargers/:id/configure-wifi'
    );
    logger.info(
      `Borne simulée (identité déclarée): ${SIMULATED_CHARGE_POINT_IDENTITY} → ws://${apiAdvertised}:${OCPP_PORT}/${SIMULATED_CHARGE_POINT_IDENTITY}`
    );
  });
}

bootstrap().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
