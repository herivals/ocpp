let transactionCounter = 1000;
const activeTransactions = new Map();

function createTransactionId() {
  transactionCounter += 1;
  return transactionCounter;
}

function handleStartTransaction(client, params, logger) {
  logger.info(`[${client.identity}] StartTransaction received`, params);

  const transactionId = createTransactionId();
  activeTransactions.set(transactionId, {
    identity: client.identity,
    connectorId: params?.connectorId,
    idTag: params?.idTag,
    meterStart: params?.meterStart,
    startedAt: params?.timestamp || new Date().toISOString()
  });

  return {
    transactionId,
    idTagInfo: {
      status: 'Accepted'
    }
  };
}

function handleStopTransaction(client, params, logger) {
  logger.info(`[${client.identity}] StopTransaction received`, params);

  if (params?.transactionId) {
    activeTransactions.delete(params.transactionId);
  }

  return {
    idTagInfo: {
      status: 'Accepted'
    }
  };
}

function handleMeterValues(client, params, logger) {
  logger.info(`[${client.identity}] MeterValues received`, params);
  return {};
}

module.exports = {
  handleStartTransaction,
  handleStopTransaction,
  handleMeterValues
};
