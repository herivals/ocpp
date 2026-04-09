const fs = require('node:fs');
const path = require('node:path');

const LEVELS = ['debug', 'info', 'warn', 'error'];

function shouldLog(currentLevel, targetLevel) {
  return LEVELS.indexOf(targetLevel) >= LEVELS.indexOf(currentLevel);
}

function safeStringify(payload) {
  if (payload === undefined) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return '[Unserializable payload]';
  }
}

function createLogger(options = {}) {
  const level = options.level || process.env.LOG_LEVEL || 'info';
  const logToFile = options.logToFile ?? process.env.LOG_TO_FILE === 'true';
  const logDir = options.logDir || path.resolve(process.cwd(), 'logs');
  const fileName = options.fileName || 'ocpp-server.log';

  let stream = null;
  if (logToFile) {
    fs.mkdirSync(logDir, { recursive: true });
    stream = fs.createWriteStream(path.join(logDir, fileName), { flags: 'a' });
  }

  function write(targetLevel, message, payload) {
    if (!shouldLog(level, targetLevel)) {
      return;
    }

    const ts = new Date().toISOString();
    const suffix = safeStringify(payload);
    const line = `${ts} [${targetLevel.toUpperCase()}] ${message}${suffix ? ` ${suffix}` : ''}`;

    // Keep console output human-friendly while supporting file extension later.
    if (targetLevel === 'error') {
      console.error(line);
    } else if (targetLevel === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }

    if (stream) {
      stream.write(`${line}\n`);
    }
  }

  return {
    debug(message, payload) {
      write('debug', message, payload);
    },
    info(message, payload) {
      write('info', message, payload);
    },
    warn(message, payload) {
      write('warn', message, payload);
    },
    error(message, payload) {
      write('error', message, payload);
    }
  };
}

module.exports = {
  createLogger
};
