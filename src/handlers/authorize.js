function handleAuthorize(client, params, logger) {
  logger.info(`[${client.identity}] Authorize received`, params);

  // In production, replace this with DB / RFID / IAM verification.
  return {
    idTagInfo: {
      status: 'Accepted'
    }
  };
}

module.exports = {
  handleAuthorize
};
