function handleHeartbeat(client, params, logger) {
  logger.info(`[${client.identity}] Heartbeat received`, params);

  return {
    currentTime: new Date().toISOString()
  };
}

function handleStatusNotification(client, params, logger) {
  logger.info(`[${client.identity}] StatusNotification received`, params);

  return {};
}

module.exports = {
  handleHeartbeat,
  handleStatusNotification
};
