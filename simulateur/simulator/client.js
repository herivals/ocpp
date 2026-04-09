'use strict';

const { RPCClient } = require('ocpp-rpc');
const { loadConfig } = require('./config');
const { registerRemoteHandlers } = require('./handlers/remoteCommands');
const { runChargingSession, sendStatusNotification } = require('./flows/chargingSession');

function createLogger(identity, enabled) {
  return function log(entry) {
    if (!enabled) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      identity,
      ...entry,
    });
    console.log(line);
  };
}

function createSessionQueue(log) {
  let tail = Promise.resolve();
  return function enqueueSession(fn) {
    tail = tail
      .then(() => fn())
      .catch((e) => {
        log({
          direction: 'error',
          method: 'SessionQueue',
          error: String(e && e.message ? e.message : e),
        });
      });
    return tail;
  };
}

function attachOcppLogging(client, identity, log, enabled) {
  if (!enabled) return;

  function parseCallPayload(payload) {
    if (!Array.isArray(payload) || payload.length < 3) return {};
    const [, messageId, a, b] = payload;
    if (typeof a === 'string') {
      return { messageId, method: a, params: b };
    }
    return { messageId, raw: payload };
  }

  client.on('call', (ev) => {
    const { outbound, payload } = ev;
    const p = parseCallPayload(payload);
    log({
      direction: outbound ? 'out' : 'in',
      kind: 'Call',
      ...p,
    });
  });

  client.on('callResult', (ev) => {
    const { outbound, messageId, method, params, result } = ev;
    log({
      direction: outbound ? 'out' : 'in',
      kind: 'CallResult',
      messageId,
      method,
      params,
      result,
    });
  });

  client.on('callError', (ev) => {
    const { outbound, messageId, method, params, error } = ev;
    log({
      direction: outbound ? 'out' : 'in',
      kind: 'CallError',
      messageId,
      method,
      params,
      errorCode: error && error.rpcErrorCode,
      errorMessage: error && (error.message || error.rpcErrorMessage),
    });
  });

  client.on('disconnect', (ev) => {
    log({ direction: 'event', kind: 'disconnect', ...ev });
  });

  client.on('connecting', () => {
    log({ direction: 'event', kind: 'connecting' });
  });

  client.on('open', () => {
    log({ direction: 'event', kind: 'open' });
  });
}

function clearHeartbeat(state) {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
}

async function runBootSequence(client, state, config, log, enqueueSession) {
  clearHeartbeat(state);

  const boot = await client.call('BootNotification', {
    chargePointVendor: 'Autel',
    chargePointModel: 'MaxiCharger AC Elite',
    chargePointSerialNumber: state.serialNumber,
    chargeBoxSerialNumber: state.serialNumber,
    firmwareVersion: '1.5.2',
    iccid: '',
    imsi: '',
    meterType: 'AC_ENERGY',
    meterSerialNumber: `METER-${state.identity}`,
  });

  if (boot.status !== 'Accepted') {
    log({
      direction: 'error',
      kind: 'BootRejected',
      note: 'Le serveur n’a pas accepté BootNotification — Heartbeat non démarré.',
    });
    return;
  }

  const intervalSec =
    typeof boot.interval === 'number' && boot.interval > 0
      ? boot.interval
      : config.heartbeatFallbackSec;

  state.heartbeatTimer = setInterval(() => {
    client
      .call('Heartbeat', {})
      .catch((e) => {
        log({
          direction: 'error',
          method: 'Heartbeat',
          error: String(e && e.message ? e.message : e),
        });
      });
  }, intervalSec * 1000);

  await sendStatusNotification(client, { connectorId: 0, status: 'Available' });
  await sendStatusNotification(client, { connectorId: state.connectorId, status: 'Available' });

  if (config.runDemoSession && !state.demoScheduled) {
    state.demoScheduled = true;
    setTimeout(() => {
      enqueueSession(async () => {
        await runChargingSession(client, state, {
          connectorId: state.connectorId,
          idTag: state.idTag,
          meterIntervalMs: 10000,
          durationMs: 30000,
          reason: 'Local',
          simulatedPowerW: config.simulatedPowerW,
        });
      });
    }, config.demoDelayMs);
  }
}

async function startOneChargePoint(globalConfig, identity) {
  const config = { ...globalConfig };
  const log = createLogger(identity, config.logOcppJson);
  const enqueueSession = createSessionQueue(log);

  const state = {
    identity,
    connectorId: config.connectorId,
    idTag: config.idTag,
    transactionId: null,
    meterWh: config.meterStartWh,
    simulatedPowerW: config.simulatedPowerW,
    heartbeatTimer: null,
    demoScheduled: false,
    serialNumber: `SN-${identity.replace(/[^a-zA-Z0-9_-]/g, '')}`,
  };

  const clientOpts = {
    endpoint: config.endpoint,
    identity,
    protocols: ['ocpp1.6'],
    reconnect: config.reconnect,
  };

  if (config.password != null && config.password !== '') {
    clientOpts.password = config.password;
  }

  if (config.strictMode === true) {
    clientOpts.strictMode = true;
  }

  const client = new RPCClient(clientOpts);

  attachOcppLogging(client, identity, log, config.logOcppJson);

  registerRemoteHandlers(client, {
    log,
    state,
    config,
    enqueueSession,
  });

  let booted = false;

  client.on('open', async () => {
    if (booted) {
      log({ direction: 'info', kind: 'reconnect', note: 'nouveau BootNotification' });
    }
    booted = true;
    try {
      await runBootSequence(client, state, config, log, enqueueSession);
    } catch (e) {
      log({
        direction: 'error',
        kind: 'BootSequence',
        error: String(e && e.message ? e.message : e),
      });
    }
  });

  const websocketUrl = `${config.endpoint}/${encodeURIComponent(identity)}`;
  log({
    direction: 'info',
    kind: 'start',
    endpoint: config.endpoint,
    websocketUrl,
    identity,
    basicAuth: Boolean(config.password),
  });

  await client.connect();
}

async function main() {
  const config = loadConfig();
  const identities = config.identities.length ? config.identities : ['AUTEL_SIM_001'];

  await Promise.all(identities.map((id) => startOneChargePoint(config, id)));
}

main().catch((err) => {
  const msg = String(err.message || err);
  const hints = [];
  if (/Unauthorized/i.test(msg) || err.code === 401) {
    hints.push(
      'HTTP 401 : définir OCPP_PASSWORD si le CSMS utilise Basic auth (OCPP 1.6J, user = OCPP_IDENTITY). Vérifier que l’identité de borne est enregistrée / autorisée côté serveur.',
    );
  }
  hints.push(
    'Vérifier OCPP_URL (ex. ws://172.23.184.174:9220) : même hôte et port que l’écoute WebSocket du CSMS.',
  );
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      fatal: true,
      error: msg,
      httpStatus: err.code,
      hints,
    }),
  );
  process.exit(1);
});
