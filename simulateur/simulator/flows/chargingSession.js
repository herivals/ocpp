'use strict';

/**
 * Session de recharge simulée (comportement type borne AC Autel).
 * Ordre : Preparing → Authorize → StartTransaction → Charging + MeterValues → StopTransaction → Available.
 */

function isoNow() {
  return new Date().toISOString();
}

function energyDeltaWh(powerW, seconds) {
  return (powerW * seconds) / 3600;
}

/**
 * @param {import('ocpp-rpc').RPCClient} client
 * @param {object} opts
 */
async function sendStatusNotification(client, { connectorId, status, errorCode = 'NoError' }) {
  await client.call('StatusNotification', {
    connectorId,
    errorCode,
    status,
  });
}

/**
 * @param {import('ocpp-rpc').RPCClient} client
 */
async function sendMeterValues(client, { connectorId, transactionId, energyWh, powerW }) {
  await client.call('MeterValues', {
    connectorId,
    transactionId,
    meterValue: [
      {
        timestamp: isoNow(),
        sampledValue: [
          {
            value: String(Math.round(energyWh * 1000) / 1000),
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'Sample.Periodic',
          },
          {
            value: String(powerW),
            measurand: 'Power.Active.Import',
            unit: 'W',
            context: 'Sample.Periodic',
          },
        ],
      },
    ],
  });
}

/**
 * Parcourt une session complète de recharge.
 *
 * @param {import('ocpp-rpc').RPCClient} client
 * @param {object} state - état mutable ({ meterWh, transactionId, ... })
 * @param {object} cfg
 * @param {number} cfg.connectorId
 * @param {string} cfg.idTag
 * @param {number} [cfg.meterIntervalMs=10000]
 * @param {number} [cfg.durationMs=30000]
 * @param {string} [cfg.reason='Local']
 * @param {number} [cfg.simulatedPowerW=7400]
 */
async function runChargingSession(client, state, cfg) {
  const connectorId = cfg.connectorId ?? state.connectorId;
  const idTag = cfg.idTag ?? state.idTag;
  const meterIntervalMs = cfg.meterIntervalMs ?? 10000;
  const durationMs = cfg.durationMs ?? 30000;
  const reason = cfg.reason ?? 'Local';
  const simulatedPowerW = cfg.simulatedPowerW ?? state.simulatedPowerW ?? 7400;

  if (state.transactionId != null) {
    throw new Error(`Session déjà active (transactionId=${state.transactionId})`);
  }

  await sendStatusNotification(client, { connectorId, status: 'Preparing' });

  const auth = await client.call('Authorize', { idTag });
  if (auth.idTagInfo && auth.idTagInfo.status && auth.idTagInfo.status !== 'Accepted') {
    await sendStatusNotification(client, { connectorId, status: 'Available' });
    throw new Error(`Authorize refusé: ${auth.idTagInfo.status}`);
  }

  const meterStart = state.meterWh;
  const start = await client.call('StartTransaction', {
    connectorId,
    idTag,
    meterStart,
    timestamp: isoNow(),
  });

  const tid = start.transactionId;
  if (tid === undefined || tid === null) {
    await sendStatusNotification(client, { connectorId, status: 'Available' });
    throw new Error('StartTransaction sans transactionId');
  }

  state.transactionId = tid;

  await sendStatusNotification(client, { connectorId, status: 'Charging' });

  const t0 = Date.now();
  await sendMeterValues(client, {
    connectorId,
    transactionId: tid,
    energyWh: state.meterWh,
    powerW: simulatedPowerW,
  });

  while (Date.now() - t0 < durationMs) {
    if (state.transactionId !== tid) {
      return;
    }
    const wait = Math.min(meterIntervalMs, durationMs - (Date.now() - t0));
    if (wait <= 0) break;
    await new Promise((r) => setTimeout(r, wait));
    if (state.transactionId !== tid) {
      return;
    }
    const elapsedSec = (Date.now() - t0) / 1000;
    state.meterWh = meterStart + energyDeltaWh(simulatedPowerW, elapsedSec);
    await sendMeterValues(client, {
      connectorId,
      transactionId: tid,
      energyWh: state.meterWh,
      powerW: simulatedPowerW,
    });
  }

  if (state.transactionId !== tid) {
    return;
  }

  await client.call('StopTransaction', {
    transactionId: tid,
    idTag,
    timestamp: isoNow(),
    reason,
    meterStop: state.meterWh,
  });

  state.transactionId = null;
  await sendStatusNotification(client, { connectorId, status: 'Available' });
}

/**
 * Arrêt demandé par le CSMS (RemoteStopTransaction) : envoie StopTransaction puis Available.
 */
async function stopTransactionRemote(client, state, { transactionId, reason = 'Remote' }) {
  if (state.transactionId == null || state.transactionId !== transactionId) {
    return { stopped: false };
  }

  const connectorId = state.connectorId;
  const idTag = state.idTag;

  await client.call('StopTransaction', {
    transactionId,
    idTag,
    timestamp: isoNow(),
    reason,
    meterStop: state.meterWh,
  });

  state.transactionId = null;
  await sendStatusNotification(client, { connectorId, status: 'Available' });
  return { stopped: true };
}

module.exports = {
  runChargingSession,
  stopTransactionRemote,
  sendStatusNotification,
  sendMeterValues,
  isoNow,
};
