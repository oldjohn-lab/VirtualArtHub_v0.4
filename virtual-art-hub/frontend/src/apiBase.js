/**
 * 生产环境（Docker 内 Nginx 反代）：API 走同源 `/api`，勿写死 :5002，否则浏览器会请求未映射端口导致登录/列表失败。
 * 前后端分离时请在构建时设置 REACT_APP_API_ORIGIN 或 REACT_APP_API_BASE_URL。
 */
export const API_ORIGIN =
  process.env.REACT_APP_API_ORIGIN ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5002');

/**
 * 本地 `npm start` 且未配置 REACT_APP_API_* 时，通过当前页面的同源路径 `/api/...` 访问后端，
 * 走 `src/setupProxy.js` 转发到 Koa（默认 http://127.0.0.1:5002，可用 REACT_APP_PROXY_TARGET 改为 https），
 * 避免请求直连 :5002（在仅开放 3000、或局域网访问时常失败）。
 */
export function devApiProxyMode() {
  return (
    typeof window !== 'undefined' &&
    process.env.NODE_ENV === 'development' &&
    !process.env.REACT_APP_API_BASE_URL &&
    !process.env.REACT_APP_API_ORIGIN
  );
}

/** Socket.IO：开发走同源以便 dev server 代理 WebSocket */
export function socketOrigin() {
  if (devApiProxyMode()) return window.location.origin;
  return API_ORIGIN;
}

/** 与 Koa `router prefix: '/api'` 对齐；若手动配置漏写 /api 则补上，避免请求落到 /galleries 而 404 */
function normalizeApiBaseUrl(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return `${API_ORIGIN.replace(/\/+$/, '')}/api`;
  if (/\/api(\/|$)/i.test(s)) return s;
  return `${s}/api`;
}

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL
  ? normalizeApiBaseUrl(process.env.REACT_APP_API_BASE_URL)
  : devApiProxyMode()
    ? '/api'
    : `${API_ORIGIN.replace(/\/+$/, '')}/api`;

export function apiUrl(pathname) {
  const p = pathname ? String(pathname) : '';
  if (!p) return API_BASE_URL;

  const path = p.startsWith('/') ? p : `/${p}`;

  if (devApiProxyMode()) {
    if (path.startsWith('/api/') || path === '/api') {
      return path.replace(/\/+$/, '') || '/api';
    }
    return (`/api${path}`).replace(/\/{2,}/g, '/');
  }

  const base = API_BASE_URL.replace(/\/+$/, '');
  if (path.startsWith('/api/')) {
    const origin = base.replace(/\/api$/i, '');
    return `${origin}${path}`;
  }
  return `${base}${path}`;
}

