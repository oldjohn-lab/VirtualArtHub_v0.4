const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * 开发环境将同源 `/api`、`/socket.io` 转发到 Koa。
 * 全站 HTTPS 时：在 `.env.development` 中设置 HTTPS=true，并将 REACT_APP_PROXY_TARGET=https://127.0.0.1:5002
 * （后端需 USE_HTTPS=1；自签证书时 secure: false 已在下方按目标协议自动启用）。
 */
module.exports = function setupProxy(app) {
  const target = process.env.REACT_APP_PROXY_TARGET || 'http://127.0.0.1:5002';
  const toHttps = /^https:/i.test(target);
  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    ...(toHttps ? { secure: false } : {}),
  });
  app.use('/api', proxy);
  app.use('/socket.io', proxy);
};
