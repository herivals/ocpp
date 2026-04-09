# OCPP 1.6 Central System (Node.js)

Serveur OCPP 1.6 (WebSocket) en JavaScript avec architecture modulaire, gestion multi-bornes et API REST pour commandes distantes.

## Prerequisites

- Node.js 18+
- npm

## Installation

```bash
npm install
```

## Run

```bash
node src/server.js
```

ou

```bash
npm start
```

## Ports

- OCPP WebSocket: `9220` (configurable via `OCPP_PORT`)
- HTTP API: `3001` (configurable via `API_PORT`)

## Charge point connection URL

Les bornes doivent se connecter avec leur identifiant dans l'URL:

`ws://<host>:9220/<identity>`

Exemple:

`ws://127.0.0.1:9220/AUTEL_CP_01`

## Supported inbound OCPP 1.6 actions

- `BootNotification`
- `Heartbeat`
- `StatusNotification`
- `Authorize`
- `StartTransaction`
- `StopTransaction`
- `MeterValues`

Chaque message est logge et recoit une reponse conforme OCPP 1.6.

## Remote commands from central system

Fonctions disponibles dans `src/services/chargePointService.js`:

- `remoteStartTransaction(identity, payload)`
- `remoteStopTransaction(identity, payload)`
- `reset(identity, payload)`

## REST API

### Health

`GET /health`

### Start transaction (bonus)

`POST /start`

Body JSON:

```json
{
  "identity": "AUTEL_CP_01",
  "idTag": "ABC123",
  "connectorId": 1
}
```

### Stop transaction

`POST /stop`

Body JSON:

```json
{
  "identity": "AUTEL_CP_01",
  "transactionId": 1001
}
```

### Reset charger

`POST /reset`

Body JSON:

```json
{
  "identity": "AUTEL_CP_01",
  "type": "Soft"
}
```

## Logging

Par defaut: logs console.

Pour activer le log fichier:

- `LOG_TO_FILE=true`
- optionnel: `LOG_LEVEL=debug|info|warn|error`

Le fichier est cree dans `./logs/ocpp-server.log`.

## Notes production

- Le parsing de l'identite est base sur l'URL WebSocket (`/<identity>`), pratique pour les bornes reelles (ex: Autel).
- Le stockage actuel est en memoire (`Map`) et se remplace facilement par une base de donnees plus tard.
- Les validations metier (Authorize, StartTransaction, etc.) sont actuellement en mode "Accepted" par defaut et doivent etre branchees sur votre logique IAM/Billing.
# ocpp
