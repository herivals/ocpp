FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY configs/ ./configs/
COPY public/ ./public/

EXPOSE 9220 3001

CMD ["node", "src/server.js"]
