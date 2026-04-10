class ChargePointService {
  constructor(logger) {
    this.logger = logger;
    this.clients = new Map();
  }

  register(client) {
    this.clients.set(client.identity, client);
    this.logger.info(`Charge point connected: ${client.identity}`);
  }

  unregister(identity) {
    this.clients.delete(identity);
    this.logger.info(`Charge point disconnected: ${identity}`);
  }

  has(identity) {
    return this.clients.has(identity);
  }

  get(identity) {
    return this.clients.get(identity);
  }

  list() {
    return [...this.clients.keys()];
  }

  async call(identity, action, payload = {}, options = {}) {
    const client = this.get(identity);
    if (!client) {
      const error = new Error(`Charge point "${identity}" not connected`);
      error.code = 'CHARGE_POINT_NOT_CONNECTED';
      throw error;
    }

    this.logger.info(`[${identity}] Sending ${action}`, payload);

    const response = await client.call(action, payload, {
      callTimeoutMs: options.callTimeoutMs || 15000
    });

    this.logger.info(`[${identity}] ${action} response`, response);
    return response;
  }

  remoteStartTransaction(identity, payload) {
    return this.call(identity, 'RemoteStartTransaction', payload);
  }

  remoteStopTransaction(identity, payload) {
    return this.call(identity, 'RemoteStopTransaction', payload);
  }

  reset(identity, payload) {
    return this.call(identity, 'Reset', payload);
  }

  normalizeConfigurationKeys(response) {
    if (!response || typeof response !== 'object') {
      const error = new Error('Invalid GetConfiguration response: expected object');
      error.code = 'INVALID_OCPP_RESPONSE';
      throw error;
    }

    const rawKeys = Array.isArray(response.configurationKey) ? response.configurationKey : [];
    return rawKeys.map((entry) => ({
      key: entry?.key ?? '',
      value: entry?.value ?? null,
      readonly: Boolean(entry?.readonly)
    }));
  }

  async getConfiguration(chargerId, keys = []) {
    const payload = { key: keys };
    this.logger.info(`[${chargerId}] GetConfiguration request`, payload);

    let rawResponse;
    try {
      rawResponse = await this.call(chargerId, 'GetConfiguration', payload, {
        callTimeoutMs: 15000
      });
    } catch (error) {
      if (error?.code === 'CHARGE_POINT_NOT_CONNECTED') {
        throw error;
      }

      const message = String(error?.message || '').toLowerCase();
      if (message.includes('timeout') || message.includes('timed out')) {
        const timeoutError = new Error(`GetConfiguration timeout for charger "${chargerId}"`);
        timeoutError.code = 'OCPP_TIMEOUT';
        throw timeoutError;
      }

      const wrapped = new Error(`GetConfiguration failed for charger "${chargerId}": ${error.message}`);
      wrapped.code = 'GET_CONFIGURATION_FAILED';
      throw wrapped;
    }

    this.logger.info(`[${chargerId}] GetConfiguration raw response`, rawResponse);
    const formattedKeys = this.normalizeConfigurationKeys(rawResponse);
    this.logger.info(`[${chargerId}] GetConfiguration formatted keys`, formattedKeys);

    const unknownKeys = Array.isArray(rawResponse?.unknownKey) ? rawResponse.unknownKey : [];
    if (unknownKeys.length > 0) {
      // Some stations do not support every requested key; keep this non-blocking.
      this.logger.warn(`[${chargerId}] GetConfiguration unknown keys`, unknownKeys);
    }

    return {
      keys: formattedKeys,
      unknownKeys,
      rawResponse
    };
  }
}

module.exports = {
  ChargePointService
};
