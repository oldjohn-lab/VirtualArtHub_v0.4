const path = require('path');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const BACKEND_ROOT = path.resolve(__dirname, '..', 'backend');

function assertJwtConfigured() {
  const secret = process.env.JWT_SECRET;
  const weak =
    !secret ||
    secret === 'supersecretjwtkey' ||
    String(secret).length < 16;
  if (process.env.NODE_ENV === 'production' && weak) {
    console.error(
      '[security] NODE_ENV=production requires JWT_SECRET to be set to a random string of at least 16 characters.'
    );
    process.exit(1);
  }
}

function getJwtSecret() {
  return process.env.JWT_SECRET || 'supersecretjwtkey';
}

/**
 * Resolve a path stored in DB relative to backend root. Blocks ../ and absolute paths.
 * @param {string|null|undefined} rel
 * @param {string[]} [allowedPrefixes] posix-style prefixes e.g. ['uploads/avatars']
 * @returns {string|null} absolute path or null if unsafe
 */
function safeResolveBackendPath(rel, allowedPrefixes) {
  if (rel == null || rel === '') return null;
  let s = String(rel).trim().replace(/\\/g, '/');
  if (s.includes('..') || s.startsWith('/') || /^[a-zA-Z]:/.test(s)) return null;

  const abs = path.resolve(BACKEND_ROOT, s);
  const relToRoot = path.relative(BACKEND_ROOT, abs);
  const relNorm = relToRoot.split(path.sep).join('/');
  if (relNorm.startsWith('..') || path.isAbsolute(relToRoot)) return null;

  if (allowedPrefixes && allowedPrefixes.length) {
    const ok = allowedPrefixes.some((pre) => relNorm === pre || relNorm.startsWith(`${pre}/`));
    if (!ok) return null;
  }
  return abs;
}

async function securityHeaders(ctx, next) {
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.set('X-Frame-Options', 'SAMEORIGIN');
  ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  ctx.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  await next();
}

/** Login / register: per-IP burst protection */
const loginLimiter = new RateLimiterMemory({
  points: 20,
  duration: 60,
  blockDuration: 120,
});

const registerLimiter = new RateLimiterMemory({
  points: 8,
  duration: 3600,
  blockDuration: 900,
});

async function rateLimitLogin(ctx, next) {
  try {
    await loginLimiter.consume(ctx.ip);
    await next();
  } catch {
    ctx.status = 429;
    ctx.set('Retry-After', '60');
    ctx.body = { msg: 'Too many attempts, try again later' };
  }
}

async function rateLimitRegister(ctx, next) {
  try {
    await registerLimiter.consume(ctx.ip);
    await next();
  } catch {
    ctx.status = 429;
    ctx.set('Retry-After', '900');
    ctx.body = { msg: 'Too many registrations from this address, try again later' };
  }
}

const MAX_CHAT_MESSAGE_LEN = 8000;

function clampChatMessage(text) {
  const s = text != null ? String(text) : '';
  if (s.length <= MAX_CHAT_MESSAGE_LEN) return s;
  return s.slice(0, MAX_CHAT_MESSAGE_LEN);
}

module.exports = {
  BACKEND_ROOT,
  assertJwtConfigured,
  getJwtSecret,
  safeResolveBackendPath,
  securityHeaders,
  rateLimitLogin,
  rateLimitRegister,
  MAX_CHAT_MESSAGE_LEN,
  clampChatMessage,
};
