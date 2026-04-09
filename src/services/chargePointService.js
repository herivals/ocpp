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
}

module.exports = {
  ChargePointService
};
