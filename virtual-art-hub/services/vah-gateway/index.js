/**
 * Virtual Arts Hub API Gateway：对外单一入口，向上游微服务转发 HTTP / WebSocket。
 * 可通过环境变量覆盖上游地址（便于容器编排与服务发现）。
 */
const http = require('http');
const httpProxy = require('http-proxy');

const PORT = Number(process.env.PORT || process.env.VAH_GATEWAY_PORT || 5002);

const origins = {
  auth: process.env.VAH_AUTH_ORIGIN || 'http://127.0.0.1:5101',
  gallery: process.env.VAH_GALLERY_ORIGIN || 'http://127.0.0.1:5102',
  market: process.env.VAH_MARKET_ORIGIN || 'http://127.0.0.1:5103',
  realtime: process.env.VAH_REALTIME_ORIGIN || 'http://127.0.0.1:5104',
};

function normalizeTarget(o) {
  return String(o || '').replace(/\/+$/, '');
}

function pickHttpTarget(urlPath) {
  const u = urlPath.split('?')[0] || '';
  if (u.startsWith('/socket.io')) return normalizeTarget(origins.realtime);
  if (u === '/api' || u === '/api/') return normalizeTarget(origins.auth);
  if (u.startsWith('/api/market')) return normalizeTarget(origins.market);
  if (u.startsWith('/api/admin/users')) return normalizeTarget(origins.auth);
  if (u.startsWith('/api/admin/artpieces')) return normalizeTarget(origins.gallery);
  if (
    u.startsWith('/api/auth') ||
    u.startsWith('/api/users') ||
    u.startsWith('/api/avatars')
  ) {
    return normalizeTarget(origins.auth);
  }
  if (u.startsWith('/api')) return normalizeTarget(origins.gallery);
  return normalizeTarget(origins.gallery);
}

function pickWsTarget(urlPath) {
  const u = urlPath.split('?')[0] || '';
  if (u.startsWith('/socket.io')) return normalizeTarget(origins.realtime);
  return pickHttpTarget(urlPath);
}

const proxy = httpProxy.createProxyServer({
  xfwd: true,
  ws: true,
});

proxy.on('error', (err, req, res) => {
  console.error('[vah-gateway]', err.message);
  if (res && !res.headersSent && typeof res.writeHead === 'function') {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ msg: 'Bad gateway', detail: String(err.message || '') }));
  }
});

const server = http.createServer((req, res) => {
  const pathOnly = req.url.split('?')[0];
  if (pathOnly === '/health' || pathOnly === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'vah-gateway', upstreams: origins }));
    return;
  }

  const target = pickHttpTarget(req.url || '');
  proxy.web(req, res, { target });
});

server.on('upgrade', (req, socket, head) => {
  const target = pickWsTarget(req.url || '');
  proxy.ws(req, socket, head, { target });
});

server.listen(PORT, () => {
  console.log(`[vah-gateway] listening on http://0.0.0.0:${PORT}`);
  console.log('[vah-gateway] upstreams:', origins);
});
