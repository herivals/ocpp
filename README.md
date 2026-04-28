# OCPP 1.6 Central System (Node.js)

Serveur OCPP 1.6 (WebSocket) en JavaScript avec architecture modulaire, gestion multi-bornes et API REST pour commandes distantes.

## Prerequisites

- Node.js 18+
- npm

Ou avec Docker:

- Docker Engine 20+
- Docker Compose v2+

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

## Docker

### Serveur seul (Dockerfile)

Construire l'image:

```bash
docker build -t ocpp-server .
```

Lancer le conteneur:

```bash
docker run -d \
  --name ocpp-server \
  -p 9220:9220 \
  -p 3001:3001 \
  ocpp-server
```

Avec des variables d'environnement personnalisées:

```bash
docker run -d \
  --name ocpp-server \
  -p 9220:9220 \
  -p 3001:3001 \
  -e LOG_LEVEL=debug \
  -e LOG_TO_FILE=true \
  ocpp-server
```

### Docker Compose

#### Serveur seul

```bash
docker compose up -d
```

#### Serveur + Simulateur

Le simulateur est dans un profil séparé afin de ne pas le lancer par défaut:

```bash
docker compose --profile simulator up -d
```

#### Arrêter les conteneurs

```bash
docker compose down
```

#### Variables d'environnement Docker Compose

Créer un fichier `.env` à la racine pour surcharger les valeurs par défaut:

```env
# Serveur
OCPP_PORT=9220
API_PORT=3001
LOG_LEVEL=info
LOG_TO_FILE=false

# Simulateur (profil simulator)
OCPP_IDENTITY=AE9007H2GS9C00552D
OCPP_RUN_DEMO=true
OCPP_RECONNECT=true
```

#### Consulter les logs

```bash
# Serveur
docker compose logs -f ocpp-server

# Simulateur
docker compose logs -f simulator
```

## Ports

- OCPP WebSocket: `9220` (configurable via `OCPP_PORT`)
- HTTP API: `3001` (configurable via `API_PORT`)

## Charge point connection URL

Les bornes doivent se connecter avec leur identifiant dans l'URL:

`ws://<host>:9220/<identity>`

Exemple:

`ws://127.0.0.1:9220/AE9007H2GS9C00552D`

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
  "identity": "AE9007H2GS9C00552D",
  "idTag": "ABC123",
  "connectorId": 1
}
```

### Stop transaction

`POST /stop`

Body JSON:

```json
{
  "identity": "AE9007H2GS9C00552D",
  "transactionId": 1001
}
```

### Reset charger

`POST /reset`

Body JSON:

```json
{
  "identity": "AE9007H2GS9C00552D",
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
