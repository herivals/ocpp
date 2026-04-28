const express = require('express');

function buildConfigResponse(chargerId, result) {
  const response = {
    chargerId,
    keys: result.keys
  };

  if (result.unknownKeys?.length) {
    response.unknownKeys = result.unknownKeys;
  }

  return response;
}

function mapErrorToHttp(error) {
  if (error?.code === 'CHARGE_POINT_NOT_CONNECTED') {
    return { status: 404, body: { error: error.message } };
  }

  if (error?.code === 'OCPP_TIMEOUT') {
    return { status: 504, body: { error: error.message } };
  }

  if (error?.code === 'INVALID_OCPP_RESPONSE') {
    return { status: 502, body: { error: error.message } };
  }

  if (error?.code === 'FILE_NOT_FOUND') {
    return { status: 404, body: { error: error.message } };
  }

  if (error?.code === 'INVALID_JSON' || error?.code === 'INVALID_CONFIG_FILE') {
    return { status: 400, body: { error: error.message } };
  }

  if (error?.code === 'INVALID_WIFI_PAYLOAD') {
    return { status: 400, body: { error: error.message } };
  }

  return { status: 500, body: { error: error?.message || 'Internal error' } };
}

function createChargerRoutes({ chargePointService, logger }) {
  const router = express.Router();

  // List connected chargers
  router.get('/', (req, res) => {
    return res.json({ chargers: chargePointService.list() });
  });

  // Batch routes must be defined before /:id routes to avoid capture
  router.post('/batch/apply-config', async (req, res) => {
    const { chargerIds, filePath, dryRun = false } = req.body || {};

    if (!Array.isArray(chargerIds) || chargerIds.length === 0) {
      return res.status(400).json({ error: 'chargerIds (non-empty array) is required' });
    }
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'filePath is required' });
    }

    try {
      const results = await chargePointService.batchApplyConfig(chargerIds, filePath, { dryRun });
      return res.json({ total: chargerIds.length, results });
    } catch (error) {
      logger.error('POST /chargers/batch/apply-config failed', { message: error.message });
      return res.status(500).json({ error: error.message });
    }
  });

  router.post('/batch/configure-wifi', async (req, res) => {
    const { chargerIds, ssid, password, dryRun = false, enable = true } = req.body || {};

    if (!Array.isArray(chargerIds) || chargerIds.length === 0) {
      return res.status(400).json({ error: 'chargerIds (non-empty array) is required' });
    }

    try {
      const results = await chargePointService.batchConfigureWifi(chargerIds, { ssid, password, dryRun, enable });
      return res.json({ total: chargerIds.length, results });
    } catch (error) {
      logger.error('POST /chargers/batch/configure-wifi failed', { message: error.message });
      return res.status(500).json({ error: error.message });
    }
  });

  router.post('/batch/reset', async (req, res) => {
    const { chargerIds, type = 'Soft' } = req.body || {};

    if (!Array.isArray(chargerIds) || chargerIds.length === 0) {
      return res.status(400).json({ error: 'chargerIds (non-empty array) is required' });
    }

    try {
      const results = await chargePointService.batchReset(chargerIds, type);
      return res.json({ total: chargerIds.length, results });
    } catch (error) {
      logger.error('POST /chargers/batch/reset failed', { message: error.message });
      return res.status(500).json({ error: error.message });
    }
  });

  // Single charger routes
  router.get('/:id/config', async (req, res) => {
    const chargerId = req.params.id;
    try {
      const result = await chargePointService.getConfiguration(chargerId, []);
      return res.json(buildConfigResponse(chargerId, result));
    } catch (error) {
      logger.error(`GET /chargers/${chargerId}/config failed`, { message: error.message, code: error.code });
      const httpError = mapErrorToHttp(error);
      return res.status(httpError.status).json(httpError.body);
    }
  });

  router.get('/:id/config/:key', async (req, res) => {
    const chargerId = req.params.id;
    const configKey = req.params.key;

    try {
      const result = await chargePointService.getConfiguration(chargerId, [configKey]);
      return res.json(buildConfigResponse(chargerId, result));
    } catch (error) {
      logger.error(`GET /chargers/${chargerId}/config/${configKey} failed`, {
        message: error.message,
        code: error.code
      });
      const httpError = mapErrorToHttp(error);
      return res.status(httpError.status).json(httpError.body);
    }
  });

  router.post('/:id/apply-config', async (req, res) => {
    const chargerId = req.params.id;
    const { filePath, dryRun = false } = req.body || {};

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'filePath is required' });
    }

    try {
      const summary = await chargePointService.applyConfigurationFromFile(chargerId, filePath, {
        dryRun
      });

      return res.json({
        chargerId: summary.chargerId,
        total: summary.total,
        successCount: summary.successCount,
        errorCount: summary.errorCount,
        skippedReadonlyCount: summary.skippedReadonlyCount,
        dryRun: summary.dryRun,
        results: summary.results
      });
    } catch (error) {
      logger.error(`POST /chargers/${chargerId}/apply-config failed`, {
        message: error.message,
        code: error.code
      });
      const httpError = mapErrorToHttp(error);
      return res.status(httpError.status).json(httpError.body);
    }
  });

  router.post('/:id/configure-wifi', async (req, res) => {
    const chargerId = req.params.id;
    const {
      ssid = 'Atelier_zone1',
      password = 'Soluti0ns_30',
      dryRun = false,
      enable = true
    } = req.body || {};

    try {
      const result = await chargePointService.configureWifi(chargerId, {
        ssid,
        password,
        dryRun,
        enable
      });

      return res.json(result);
    } catch (error) {
      logger.error(`POST /chargers/${chargerId}/configure-wifi failed`, {
        message: error.message,
        code: error.code
      });
      const httpError = mapErrorToHttp(error);
      return res.status(httpError.status).json(httpError.body);
    }
  });

  return router;
}

module.exports = {
  createChargerRoutes
};
