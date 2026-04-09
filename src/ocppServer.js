const { RPCServer, createRPCError } = require('ocpp-rpc');

const { getAdvertisedHost } = require('./utils/networkAddress');
const { handleBootNotification } = require('./handlers/bootNotification');
const { handleAuthorize } = require('./handlers/authorize');
const { handleHeartbeat, handleStatusNotification } = require('./handlers/status');
const {
  handleStartTransaction,
  handleStopTransaction,
  handleMeterValues
} = require('./handlers/transaction');

function createOcppServer({ logger, chargePointService, port = 9220, host = '0.0.0.0' }) {
  const server = new RPCServer({
    protocols: ['ocpp1.6'],
    strictMode: true
  });

  server.auth((accept, reject, handshake) => {
    // ocpp-rpc fournit déjà identity (dernier segment du chemin WebSocket), pas req.url HTTP brut.
    const identity = handshake.identity;
    if (!identity) {
      logger.warn('Rejected connection: missing charge point identity in URL');
      reject(401, 'Charge point identity required in URL path');
      return;
    }

    logger.info(`Incoming OCPP connection: ${identity}`);
    accept({ identity });
  });

  server.on('client', (client) => {
    chargePointService.register(client);

    client.on('close', () => {
      chargePointService.unregister(client.identity);
    });

    client.on('error', (error) => {
      logger.error(`[${client.identity}] Client error`, { message: error.message });
    });

    client.on('badMessage', (event) => {
      logger.warn(`[${client.identity}] Bad message`, event);
    });

    // Useful visibility for OCPP frame flow (CALL/CALLRESULT/CALLERROR arrays).
    client.on('call', (event) => {
      logger.debug(`[${client.identity}] CALL ${event.method}`, event.params);
    });

    client.on('callResult', (event) => {
      logger.debug(`[${client.identity}] CALLRESULT ${event.method}`, event.result);
    });

    client.handle('BootNotification', ({ params }) => {
      return handleBootNotification(client, params, logger);
    });

    client.handle('Heartbeat', ({ params }) => {
      return handleHeartbeat(client, params, logger);
    });

    client.handle('StatusNotification', ({ params }) => {
      return handleStatusNotification(client, params, logger);
    });

    client.handle('Authorize', ({ params }) => {
      return handleAuthorize(client, params, logger);
    });

    client.handle('StartTransaction', ({ params }) => {
      return handleStartTransaction(client, params, logger);
    });

    client.handle('StopTransaction', ({ params }) => {
      return handleStopTransaction(client, params, logger);
    });

    client.handle('MeterValues', ({ params }) => {
      return handleMeterValues(client, params, logger);
    });

    client.handle(({ method, params }) => {
      logger.warn(`[${client.identity}] Unsupported method ${method}`, params);
      throw createRPCError('NotImplemented');
    });
  });

  server.on('error', (error) => {
    logger.error('OCPP server error', { message: error.message });
  });

  async function start() {
    await server.listen(port, host);
    const advertised = getAdvertisedHost(host);
    logger.info(`OCPP server listening on ws://${host}:${port}`);
    logger.info(`Charge points should connect using: ws://${advertised}:${port}/<identity>`);
  }

  return {
    start,
    rawServer: server
  };
}

module.exports = {
  createOcppServer
};
