'use strict';

const { createRPCError } = require('ocpp-rpc');
const { runChargingSession, stopTransactionRemote } = require('../flows/chargingSession');

/**
 * Enregistre les handlers CALL entrants (CSMS → borne) OCPP 1.6.
 *
 * @param {import('ocpp-rpc').RPCClient} client
 * @param {object} ctx
 * @param {(msg: object) => void} ctx.log - logger structuré
 * @param {object} ctx.state - état partagé (transactionId, connectorId, idTag, meterWh, ...)
 * @param {object} ctx.config - loadConfig()
 * @param {(fn: () => Promise<void>) => void} ctx.enqueueSession - sérialise les sessions (démo + remote)
 */
function registerRemoteHandlers(client, ctx) {
  const { log, state, config, enqueueSession } = ctx;

  client.handle('RemoteStartTransaction', ({ params }) => {
    log({ direction: 'in', method: 'RemoteStartTransaction', params });
    const idTag = params.idTag || state.idTag;
    const connectorId = params.connectorId != null ? params.connectorId : state.connectorId;

    if (state.transactionId != null) {
      log({ direction: 'out', method: 'RemoteStartTransaction', note: 'rejected_busy' });
      return { status: 'Rejected' };
    }

    enqueueSession(async () => {
      try {
        state.idTag = idTag;
        state.connectorId = connectorId;
        await runChargingSession(client, state, {
          connectorId,
          idTag,
          meterIntervalMs: 10000,
          durationMs: 30000,
          reason: 'Remote',
          simulatedPowerW: config.simulatedPowerW,
        });
      } catch (e) {
        log({
          direction: 'error',
          method: 'RemoteStartTransaction.followup',
          error: String(e && e.message ? e.message : e),
        });
        try {
          await client.call('StatusNotification', {
            connectorId: state.connectorId,
            errorCode: 'NoError',
            status: 'Available',
          });
        } catch (_) {
          /* ignore */
        }
      }
    });

    return { status: 'Accepted' };
  });

  client.handle('RemoteStopTransaction', ({ params }) => {
    log({ direction: 'in', method: 'RemoteStopTransaction', params });
    const transactionId = params.transactionId;

    if (state.transactionId == null || state.transactionId !== transactionId) {
      return { status: 'Rejected' };
    }

    /* Hors file de session : doit pouvoir interrompre une recharge en cours. */
    queueMicrotask(async () => {
      try {
        await stopTransactionRemote(client, state, { transactionId, reason: 'Remote' });
      } catch (e) {
        log({
          direction: 'error',
          method: 'RemoteStopTransaction.followup',
          error: String(e && e.message ? e.message : e),
        });
      }
    });

    return { status: 'Accepted' };
  });

  client.handle('Reset', ({ params }) => {
    log({ direction: 'in', method: 'Reset', params });
    const type = params.type || 'Soft';

    queueMicrotask(async () => {
      log({ direction: 'info', method: 'Reset', note: 'simulated_reset', type });
    });

    return { status: 'Accepted' };
  });

  client.handle(({ method, params }) => {
    log({ direction: 'in', method, params, note: 'unhandled_call' });
    throw createRPCError('NotImplemented');
  });
}

module.exports = { registerRemoteHandlers };
