# Simulateur borne OCPP 1.6 (Autel)

Client WebSocket OCPP-J 1.6 basé sur [ocpp-rpc](https://github.com/mikuso/ocpp-rpc), pour tester un CSMS existant.

## Prérequis

- Node.js ≥ 18
- Un serveur OCPP 1.6 accessible en WebSocket (ex. `ws://hôte:port`)

## Installation

```bash
cd simulateur_borne
npm install
```

## Lancement

```bash
node simulator/client.js
```

Ou :

```bash
npm start
```

URL et identité par défaut : `ws://localhost:9220`, identité `AUTEL_SIM_001`. Le client se connecte en réalité à `OCPP_URL`/`OCPP_IDENTITY` (identité encodée dans le chemin, comme en OCPP-J).

### Erreur `Unauthorized` (401)

Souvent : mauvaise URL (hôte inaccessible ou mauvais port) ou **authentification** requise par le CSMS.

```bash
OCPP_URL=ws://172.23.184.174:9220 OCPP_IDENTITY=AUTEL_SIM_001 OCPP_PASSWORD=votre_secret node simulator/client.js
```

Si le serveur n’utilise pas Basic auth, laissez `OCPP_PASSWORD` vide et vérifiez que l’identité de borne est bien créée / autorisée dans le CSMS.

### Variables d’environnement (exemples)

| Variable | Description | Défaut |
|----------|-------------|--------|
| `OCPP_URL` | URL WebSocket du CSMS (sans le suffixe d’identité ; voir ci-dessous) | `ws://localhost:9220` |
| `OCPP_PASSWORD` | Mot de passe Basic auth (OCPP Security Profile 1) : utilisateur = `OCPP_IDENTITY` | — |
| `OCPP_AUTH_PASSWORD` | Alias de `OCPP_PASSWORD` | — |
| `OCPP_IDENTITY` | Identité d’une borne | `AUTEL_SIM_001` |
| `OCPP_IDENTITIES` | Plusieurs bornes (séparées par des virgules) | — |
| `OCPP_CONNECTOR_ID` | Connecteur simulé | `1` |
| `OCPP_IDTAG` | idTag pour la démo | `AUTELDEMO01` |
| `OCPP_HEARTBEAT_SEC` | Heartbeat si le serveur n’envoie pas `interval` | `60` |
| `OCPP_RUN_DEMO` | `true`/`false` — lancer une session de recharge démo après le boot | `true` |
| `OCPP_DEMO_DELAY_MS` | Délai avant la démo (ms) | `2000` |
| `OCPP_SIM_POWER_W` | Puissance simulée (W) | `7400` |
| `OCPP_LOG_JSON` | Logs JSON des échanges | `true` |
| `OCPP_STRICT` | Validation stricte ocpp-rpc | `false` |
| `OCPP_RECONNECT` | Reconnexion automatique | `true` |

Exemple multi-bornes :

```bash
OCPP_URL=ws://192.168.1.10:9220 OCPP_IDENTITIES=AUTEL_001,AUTEL_002 npm start
```

Désactiver la session démo automatique :

```bash
OCPP_RUN_DEMO=false node simulator/client.js
```

## Comportement

1. Connexion `ws://<endpoint>/<identity>` (OCPP-J).
2. `BootNotification` → si `Accepted`, Heartbeat périodique et `StatusNotification` (connecteurs 0 et N).
3. Session démo optionnelle : `Authorize` → `StartTransaction` → `MeterValues` / 10 s → 30 s → `StopTransaction` → `Available`.
4. Réception : `RemoteStartTransaction`, `RemoteStopTransaction`, `Reset` (réponses OCPP 1.6).

Les messages sont journalisés en JSON sur la sortie standard (`Call`, `CallResult`, `CallError`, événements de connexion).
