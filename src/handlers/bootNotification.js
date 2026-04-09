function handleBootNotification(client, params, logger) {
  logger.info(`[${client.identity}] BootNotification received`, params);

  return {
    status: 'Accepted',
    interval: 60,
    currentTime: new Date().toISOString()
  };
}

module.exports = {
  handleBootNotification
};
