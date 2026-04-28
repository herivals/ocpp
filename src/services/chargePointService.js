const fs = require('node:fs/promises');
const path = require('node:path');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  async readConfigurationFile(filePath) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

    let content;
    try {
      content = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        const notFound = new Error(`Configuration file not found: ${filePath}`);
        notFound.code = 'FILE_NOT_FOUND';
        throw notFound;
      }

      const readError = new Error(`Failed to read configuration file "${filePath}": ${error.message}`);
      readError.code = 'FILE_READ_ERROR';
      throw readError;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      const jsonError = new Error(`Invalid JSON in configuration file "${filePath}"`);
      jsonError.code = 'INVALID_JSON';
      throw jsonError;
    }

    const configEntries = Array.isArray(parsed?.configurationKey)
      ? parsed.configurationKey
      : Array.isArray(parsed?.keys)
      ? parsed.keys
      : null;

    if (!Array.isArray(configEntries)) {
      const invalid = new Error(
        `Invalid configuration format in "${filePath}". Expected "configurationKey" (or "keys") array.`
      );
      invalid.code = 'INVALID_CONFIG_FILE';
      throw invalid;
    }

    return {
      absolutePath,
      configEntries
    };
  }

  async applyConfigurationFromFile(chargerId, filePath, options = {}) {
    const dryRun = Boolean(options.dryRun);
    const delayMs = Number.isFinite(options.delayMs) ? Number(options.delayMs) : 200;

    if (!dryRun && !this.has(chargerId)) {
      const error = new Error(`Charge point "${chargerId}" not connected`);
      error.code = 'CHARGE_POINT_NOT_CONNECTED';
      throw error;
    }

    const { absolutePath, configEntries } = await this.readConfigurationFile(filePath);
    this.logger.info(`[${chargerId}] Applying configuration file`, {
      filePath,
      absolutePath,
      entries: configEntries.length,
      dryRun,
      delayMs
    });

    const results = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedReadonlyCount = 0;

    for (let index = 0; index < configEntries.length; index += 1) {
      const entry = configEntries[index] || {};
      const key = entry.key;
      const value = entry.value;
      const readonly = Boolean(entry.readonly);

      this.logger.info(`[${chargerId}] Applying config ${index + 1}/${configEntries.length} : ${key}`);

      if (!key) {
        errorCount += 1;
        results.push({
          key: '',
          value: value ?? null,
          status: 'Invalid',
          error: 'Missing key name'
        });
        continue;
      }

      if (readonly) {
        skippedReadonlyCount += 1;
        results.push({
          key,
          value: value ?? null,
          status: 'SkippedReadonly'
        });
        continue;
      }

      if (dryRun) {
        results.push({
          key,
          value: value ?? null,
          status: 'DryRun'
        });
        successCount += 1;
        if (delayMs > 0 && index < configEntries.length - 1) {
          await wait(delayMs);
        }
        continue;
      }

      try {
        const payload = {
          key,
          value: value == null ? '' : String(value)
        };

        this.logger.info(`[${chargerId}] ChangeConfiguration request`, payload);
        const response = await this.call(chargerId, 'ChangeConfiguration', payload, { callTimeoutMs: 15000 });
        this.logger.info(`[${chargerId}] ChangeConfiguration raw response`, response);

        const status = response?.status || 'InvalidResponse';
        if (status === 'Accepted') {
          successCount += 1;
        } else {
          errorCount += 1;
        }

        this.logger.info(`[${chargerId}] ChangeConfiguration result`, {
          key,
          value: payload.value,
          status
        });

        results.push({
          key,
          value: payload.value,
          status
        });
      } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        const isTimeout = message.includes('timeout') || message.includes('timed out');
        const normalizedError = isTimeout ? 'Timeout' : error.message;

        errorCount += 1;
        results.push({
          key,
          value: value ?? null,
          status: 'Error',
          error: normalizedError
        });

        this.logger.error(`[${chargerId}] ChangeConfiguration failed`, {
          key,
          value,
          error: normalizedError
        });
      }

      if (delayMs > 0 && index < configEntries.length - 1) {
        await wait(delayMs);
      }
    }

    const summary = {
      chargerId,
      filePath,
      dryRun,
      total: configEntries.length,
      successCount,
      errorCount,
      skippedReadonlyCount,
      results
    };

    this.logger.info(`[${chargerId}] Apply configuration summary`, {
      total: summary.total,
      successCount,
      errorCount,
      skippedReadonlyCount,
      dryRun
    });

    return summary;
  }

  async configureWifi(chargerId, options = {}) {
    const ssid = typeof options.ssid === 'string' ? options.ssid.trim() : '';
    const password = typeof options.password === 'string' ? options.password : '';
    const dryRun = Boolean(options.dryRun);
    const enable = options.enable !== false;

    if (!ssid) {
      const error = new Error('WiFi SSID is required');
      error.code = 'INVALID_WIFI_PAYLOAD';
      throw error;
    }

    if (!password) {
      const error = new Error('WiFi password is required');
      error.code = 'INVALID_WIFI_PAYLOAD';
      throw error;
    }

    if (!dryRun && !this.has(chargerId)) {
      const error = new Error(`Charge point "${chargerId}" not connected`);
      error.code = 'CHARGE_POINT_NOT_CONNECTED';
      throw error;
    }

    const wifiValueObject = {
      ssid,
      password,
      enable
    };

    const payload = {
      key: 'WifiLinkInfo',
      value: JSON.stringify(wifiValueObject)
    };

    this.logger.info(`[${chargerId}] Configure WiFi request`, {
      key: payload.key,
      value: wifiValueObject,
      dryRun
    });

    if (dryRun) {
      return {
        chargerId,
        key: payload.key,
        status: 'DryRun',
        dryRun: true,
        appliedValue: wifiValueObject
      };
    }

    try {
      const response = await this.call(chargerId, 'ChangeConfiguration', payload, { callTimeoutMs: 15000 });
      this.logger.info(`[${chargerId}] Configure WiFi raw response`, response);

      const status = response?.status || 'InvalidResponse';
      const result = {
        chargerId,
        key: payload.key,
        status,
        dryRun: false,
        appliedValue: wifiValueObject,
        rawResponse: response
      };

      this.logger.info(`[${chargerId}] Configure WiFi result`, {
        key: result.key,
        status: result.status
      });

      return result;
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('timeout') || message.includes('timed out')) {
        const timeoutError = new Error(`Configure WiFi timeout for charger "${chargerId}"`);
        timeoutError.code = 'OCPP_TIMEOUT';
        throw timeoutError;
      }

      const wrapped = new Error(`Configure WiFi failed for charger "${chargerId}": ${error.message}`);
      wrapped.code = 'CONFIGURE_WIFI_FAILED';
      throw wrapped;
    }
  }

  async batchApplyConfig(chargerIds, filePath, options = {}) {
    return Promise.all(
      chargerIds.map(async (id) => {
        try {
          const summary = await this.applyConfigurationFromFile(id, filePath, options);
          return { chargerId: id, ok: true, summary };
        } catch (e) {
          return { chargerId: id, ok: false, error: e.message, code: e.code };
        }
      })
    );
  }

  async batchConfigureWifi(chargerIds, options = {}) {
    return Promise.all(
      chargerIds.map(async (id) => {
        try {
          const result = await this.configureWifi(id, options);
          return { chargerId: id, ok: true, result };
        } catch (e) {
          return { chargerId: id, ok: false, error: e.message, code: e.code };
        }
      })
    );
  }

  async batchReset(chargerIds, type = 'Soft') {
    return Promise.all(
      chargerIds.map(async (id) => {
        try {
          const response = await this.reset(id, { type });
          return { chargerId: id, ok: true, response };
        } catch (e) {
          return { chargerId: id, ok: false, error: e.message, code: e.code };
        }
      })
    );
  }
}

module.exports = {
  ChargePointService
};
