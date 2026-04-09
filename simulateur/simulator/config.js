'use strict';

/**
 * Configuration via variables d'environnement (voir README).
 * Plusieurs bornes : OCPP_IDENTITIES=id1,id2 ou OCPP_IDENTITY pour une seule.
 */
function parseBool(v, defaultValue = false) {
  if (v === undefined || v === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function parseIntEnv(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultValue;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function getIdentities() {
  const multi = process.env.OCPP_IDENTITIES;
  if (multi && String(multi).trim()) {
    return String(multi)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const single = process.env.OCPP_IDENTITY || 'AUTEL_SIM_001';
  return [single];
}

function normalizeOcppEndpoint(url) {
  const s = String(url || '').trim();
  return s.replace(/\/+$/, '') || 'ws://localhost:9220';
}

function loadConfig(overrides = {}) {
  const endpoint = normalizeOcppEndpoint(
    process.env.OCPP_URL || process.env.OCPP_ENDPOINT || 'ws://localhost:9220',
  );
  const identities = getIdentities();

  return {
    endpoint,
    identities,
    /** Intervalle Heartbeat en secondes (écrasé par BootNotification.interval si présent) */
    heartbeatFallbackSec: parseIntEnv('OCPP_HEARTBEAT_SEC', 60),
    connectorId: parseIntEnv('OCPP_CONNECTOR_ID', 1),
    idTag: process.env.OCPP_IDTAG || 'AUTELDEMO01',
    /** Démarre une session de recharge démo après le boot (sauf si false) */
    runDemoSession: parseBool(process.env.OCPP_RUN_DEMO, true),
    /** Délai avant la démo (ms) */
    demoDelayMs: parseIntEnv('OCPP_DEMO_DELAY_MS', 2000),
    /** Logs JSON sur stdout */
    logOcppJson: parseBool(process.env.OCPP_LOG_JSON, true),
    /** ocpp-rpc strictMode (validation schéma) — désactivé par défaut pour compat serveurs */
    strictMode: parseBool(process.env.OCPP_STRICT, false),
    reconnect: parseBool(process.env.OCPP_RECONNECT, true),
    /** Mesure : énergie importée de départ (Wh) pour la démo */
    meterStartWh: parseFloat(process.env.OCPP_METER_START_WH || '0') || 0,
    /** Puissance simulée (W) pour incrémenter l'énergie */
    simulatedPowerW: parseIntEnv('OCPP_SIM_POWER_W', 7400),
    /**
     * Mot de passe OCPP Security Profile 1 (HTTP Basic : utilisateur = identity, mot de passe = cette valeur).
     * Requis si le CSMS répond 401 Unauthorized à l’upgrade WebSocket.
     */
    password:
      process.env.OCPP_PASSWORD !== undefined && process.env.OCPP_PASSWORD !== ''
        ? process.env.OCPP_PASSWORD
        : process.env.OCPP_AUTH_PASSWORD,
    ...overrides,
  };
}

module.exports = { loadConfig, parseBool, parseIntEnv, getIdentities };
