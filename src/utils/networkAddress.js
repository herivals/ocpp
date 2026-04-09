const os = require('os');

/**
 * Première IPv4 non interne (utile pour les logs quand on écoute sur 0.0.0.0).
 */
function getPrimaryIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      const isV4 = net.family === 'IPv4' || net.family === 4;
      if (isV4 && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

/**
 * Adresse à afficher pour les clients (URL réelle si listen sur toutes interfaces).
 */
function getAdvertisedHost(listenHost) {
  if (listenHost === '0.0.0.0' || listenHost === '::') {
    return getPrimaryIPv4() || 'localhost';
  }
  return listenHost;
}

module.exports = {
  getPrimaryIPv4,
  getAdvertisedHost
};
