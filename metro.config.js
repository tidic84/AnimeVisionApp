const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Expo SQLite's web worker loads its database engine as a WASM asset.
config.resolver.assetExts.push('wasm');
const previousMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const enhanced = previousMiddleware ? previousMiddleware(middleware, server) : middleware;
  return (request, response, next) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    return enhanced(request, response, next);
  };
};
module.exports = config;
