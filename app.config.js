// Complète app.json : le versionCode Android suit la version (1.2.3 -> 10203),
// pour qu'une release GitHub s'installe par-dessus la précédente.
module.exports = ({ config }) => {
  const [major, minor, patch] = config.version.split('.').map(Number);
  return { ...config, android: { ...config.android, versionCode: major * 10000 + minor * 100 + patch } };
};
