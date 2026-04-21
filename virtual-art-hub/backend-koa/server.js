require('dotenv').config();

const http = require('http');
const https = require('https');
const Koa = require('koa');
const Router = require('@koa/router');
const cors = require('@koa/cors');
const compress = require('koa-compress');
const { koaBody } = require('koa-body');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { Server } = require('socket.io');
const db = require('./db');
const { applyWatermark } = require('../backend/utils/watermark');
const {
  assertJwtConfigured,
  getJwtSecret,
  safeResolveBackendPath,
  securityHeaders,
  rateLimitLogin,
  rateLimitRegister,
  clampChatMessage,
} = require('./security');

const {
  User,
  Gallery,
  ArtPiece,
  Rating,
  GuestRating,
  Comment,
  MarketListing,
  MarketCartItem,
  MarketChatMessage,
  Sequelize,
} = db;
const Op = Sequelize.Op;

const app = new Koa();
if (String(process.env.TRUST_PROXY || '') === '1') {
  app.proxy = true;
}
const router = new Router({ prefix: '/api' });

const corsAllowList = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(/,/)
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

app.use(securityHeaders);
app.use(
  cors(
    corsAllowList && corsAllowList.length > 0
      ? {
          origin: (ctx) => {
            const o = ctx.get('Origin');
            if (!o) return '*';
            return corsAllowList.includes(o) ? o : false;
          },
          allowHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'x-guest-id'],
        }
      : {
          origin: '*',
          allowHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'x-guest-id'],
        }
  )
);
app.use(
  compress({
    threshold: 2048,
    br: false,
  })
);
app.use(
  koaBody({
    json: true,
    jsonLimit: '1mb',
    formLimit: '1mb',
    textLimit: '1mb',
    multipart: true,
    formidable: {
      uploadDir: path.resolve(__dirname, '..', 'backend', 'uploads', '_tmp'),
      keepExtensions: true,
      maxFileSize: 50 * 1024 * 1024,
    },
  })
);

function auth(ctx, next) {
  const xAuthToken = ctx.get('x-auth-token');
  const header = ctx.get('authorization') || '';
  const bearerToken = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const token = xAuthToken || bearerToken;
  if (!token) {
    ctx.status = 401;
    ctx.body = { msg: 'No token, authorization denied' };
    return;
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    ctx.state.user = decoded.user;
    return next();
  } catch {
    ctx.status = 401;
    ctx.body = { msg: 'Token is not valid' };
  }
}

async function adminAuth(ctx, next) {
  await auth(ctx, async () => {});
  if (ctx.status === 401) return;
  const user = await User.findByPk(ctx.state.user.id);
  if (!user || user.role !== 'admin') {
    ctx.status = 403;
    ctx.body = { msg: 'Admin access required' };
    return;
  }
  return next();
}

/** 微服务模式：VAH_SERVICE=all（默认单体）| auth | gallery | market | realtime（可逗号分隔） */
function shouldMount(name) {
  const v = process.env.VAH_SERVICE || 'all';
  if (v === 'all') return true;
  return v.split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(name);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function toUnixPath(p) {
  return String(p).replace(/\\/g, '/');
}

function isImagePath(p) {
  const ext = path.extname(String(p || '')).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'].includes(ext);
}

function sanitizeRichText(html) {
  if (!html) return '';
  let out = String(html);
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '');
  out = out.replace(/javascript:/gi, '');
  return out;
}

async function placeholderJpeg({ title, subtitle }) {
  const w = 1280;
  const h = 720;
  const safeTitle = String(title || '').replace(/[<>&]/g, '');
  const safeSubtitle = String(subtitle || '').replace(/[<>&]/g, '');
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f8f6f2"/>
          <stop offset="55%" stop-color="#f4eee1"/>
          <stop offset="100%" stop-color="#f8f6fa"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg)"/>
      <rect x="60" y="60" width="${w - 120}" height="${h - 120}" rx="18" ry="18" fill="rgba(255,255,255,0.7)" stroke="rgba(122,143,176,0.32)" stroke-width="2"/>
      <text x="50%" y="46%" font-family="Arial" font-size="54" fill="rgba(28,28,28,0.86)" text-anchor="middle" dominant-baseline="middle">${safeTitle || 'VIRTUAL ART HUB'}</text>
      <text x="50%" y="56%" font-family="Arial" font-size="28" fill="rgba(43,42,40,0.62)" text-anchor="middle" dominant-baseline="middle">${safeSubtitle || ''}</text>
    </svg>`
  );
  return sharp(svg).jpeg({ quality: 82 }).toBuffer();
}

function normalizeFiles(maybeFiles) {
  if (!maybeFiles) return [];
  if (Array.isArray(maybeFiles)) return maybeFiles;
  return [maybeFiles];
}

function moveUploadedFile(file, prefix) {
  const originalName = file.originalFilename || 'upload';
  const ext = path.extname(originalName) || path.extname(file.filepath) || '';
  const filename = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
  const destAbs = path.resolve(__dirname, '..', 'backend', 'uploads', filename);
  fs.renameSync(file.filepath, destAbs);
  return { destAbs, relativePath: toUnixPath(path.join('uploads', filename)) };
}

function safeColor(input, fallback) {
  const v = String(input || '').trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return v;
  return fallback;
}

function safeFont(input, fallback) {
  const v = String(input || '').trim();
  if (!v) return fallback;
  if (v.length > 60) return fallback;
  if (!/^[a-zA-Z0-9 ,'"-]+$/.test(v)) return fallback;
  return v;
}

function boolFrom(input, fallback = true) {
  if (input === undefined || input === null || input === '') return fallback;
  const v = String(input).toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return fallback;
}

function numFrom(input, fallback, min, max) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** 展厅名称 / 文学连载对应展厅名称 上限（与前台一致） */
const GALLERY_NAME_MAX_LEN = 20;
const GALLERY_DESCRIPTION_MAX_LEN = 200;

function randomPublicAccessCode() {
  return `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

async function ensurePublicAccessCodeUnique() {
  for (let i = 0; i < 10; i += 1) {
    const code = randomPublicAccessCode();
    const exists = await Gallery.findOne({ where: { publicAccessCode: code }, attributes: ['id'] });
    if (!exists) return code;
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 路由参数中的公开码：去空白、去零宽字符；与 DB 比对时配合 SQL LOWER(TRIM(...)) */
function normalizePublicAccessCodeFromRoute(raw) {
  let s = String(raw != null ? raw : '').trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    // 非法 % 转义时保留原串
  }
  return s.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function isGalleryPublicAccessEnabled(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return false;
}

/** 使用 ok 字段区分成功/失败，避免与 Sequelize 模型上的 status 等字段混淆 */
async function resolveGalleryForPublicDirectAccess(rawParam) {
  const code = normalizePublicAccessCodeFromRoute(rawParam);
  if (!code || code === '__draft__') {
    return { ok: false, status: 400, body: { msg: 'Invalid access code' } };
  }
  const userInclude = { model: User, as: 'user', attributes: ['username'] };
  let gallery = await Gallery.findOne({
    where: { publicAccessCode: code },
    include: [userInclude],
  });
  if (!gallery) {
    const needle = code.toLowerCase();
    gallery = await Gallery.findOne({
      where: Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.fn('TRIM', Sequelize.col('publicAccessCode'))),
        needle
      ),
      include: [userInclude],
    });
  }
  if (!gallery) {
    return { ok: false, status: 404, body: { msg: 'Gallery not found' } };
  }
  if (!isGalleryPublicAccessEnabled(gallery.allowPublicAccess)) {
    return { ok: false, status: 403, body: { msg: '该展厅未开启公开访问' } };
  }
  return { ok: true, gallery };
}

/** 公开直达：展厅 + 已通过审核作品分页（供 path 与 query 两种入口复用） */
async function getPublicDirectPayload(rawCode, page, pageSize) {
  const resolved = await resolveGalleryForPublicDirectAccess(rawCode);
  if (!resolved.ok) return resolved;
  const { gallery } = resolved;
  const p = page ? Math.max(1, Number(page)) : 1;
  const ps = pageSize ? Math.max(1, Math.min(100, Number(pageSize))) : 12;

  const { rows, count } = await ArtPiece.findAndCountAll({
    where: { galleryId: gallery.id, status: 'approved' },
    attributes: {
      include: [
        [
          Sequelize.literal(`(
            SELECT AVG(allr.score)
            FROM (
              SELECT r.score AS score FROM Ratings AS r WHERE r.artPieceId = ArtPiece.id
              UNION ALL
              SELECT gr.score AS score FROM GuestRatings AS gr WHERE gr.artPieceId = ArtPiece.id
            ) AS allr
          )`),
          'averageRating',
        ],
        [
          Sequelize.literal(`(
            SELECT COUNT(*)
            FROM (
              SELECT r.id AS id FROM Ratings AS r WHERE r.artPieceId = ArtPiece.id
              UNION ALL
              SELECT gr.id AS id FROM GuestRatings AS gr WHERE gr.artPieceId = ArtPiece.id
            ) AS allc
          )`),
          'ratingCount',
        ],
      ],
    },
    order: [
      ['episodeNumber', 'ASC'],
      ['id', 'ASC'],
    ],
    offset: (p - 1) * ps,
    limit: ps,
  });

  return {
    ok: true,
    payload: {
      gallery: gallery.get({ plain: true }),
      items: rows.map((row) => row.get({ plain: true })),
      total: typeof count === 'number' ? count : count?.length || 0,
      page: p,
      pageSize: ps,
    },
  };
}

async function createGalleryPosterFromUpload(file, cropOptions = {}) {
  ensureDir(path.resolve(__dirname, '..', 'backend', 'uploads', 'gallery-posters'));
  const filename = `gallery-poster-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;
  const outAbs = path.resolve(__dirname, '..', 'backend', 'uploads', 'gallery-posters', filename);

  const targetWidth = 1400;
  const targetHeight = 900;
  const targetRatio = targetWidth / targetHeight;
  const scale = Math.max(1, Math.min(3, Number(cropOptions.scale) || 1));
  const offsetX = Math.max(-1, Math.min(1, Number(cropOptions.offsetX) || 0));
  const offsetY = Math.max(-1, Math.min(1, Number(cropOptions.offsetY) || 0));

  const img = sharp(file.filepath).rotate();
  const meta = await img.metadata();
  const srcW = Number(meta.width) || 0;
  const srcH = Number(meta.height) || 0;
  if (!srcW || !srcH) {
    throw new Error('Invalid image size');
  }

  let baseW = srcW;
  let baseH = srcH;
  if (srcW / srcH > targetRatio) {
    baseW = srcH * targetRatio;
  } else {
    baseH = srcW / targetRatio;
  }
  const cropW = Math.max(1, Math.round(baseW / scale));
  const cropH = Math.max(1, Math.round(baseH / scale));
  const maxLeft = Math.max(0, srcW - cropW);
  const maxTop = Math.max(0, srcH - cropH);
  const left = Math.round((maxLeft / 2) * (offsetX + 1));
  const top = Math.round((maxTop / 2) * (offsetY + 1));

  await img
    .extract({ left: Math.max(0, Math.min(maxLeft, left)), top: Math.max(0, Math.min(maxTop, top)), width: cropW, height: cropH })
    .resize(targetWidth, targetHeight, { fit: 'cover' })
    .jpeg({ quality: 88 })
    .toFile(outAbs);

  try { fs.unlinkSync(file.filepath); } catch {}
  return toUnixPath(path.join('uploads', 'gallery-posters', filename));
}

function signToken(userId) {
  const payload = { user: { id: userId } };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '1h' });
}

let ioRef = null;
const roomState = new Map();

const emitRoomUsers = (room) => {
  if (!ioRef) return;
  const usersMap = roomState.get(room);
  const users = usersMap
    ? Array.from(usersMap.values()).map((u) => ({
        userId: u.userId,
        username: u.username,
        avatarUpdatedAt: u.avatarUpdatedAt || null,
      }))
    : [];
  ioRef.to(room).emit('room_users', { room, users });
};

const leaveTrackedRoom = (socket) => {
  const room = socket.data?.room;
  const userId = socket.data?.userId;
  if (!room || !userId) return;

  const usersMap = roomState.get(room);
  const userEntry = usersMap?.get(userId);
  if (userEntry && userEntry.sockets) {
    userEntry.sockets.delete(socket.id);
    if (userEntry.sockets.size === 0) {
      usersMap.delete(userId);
    }
  }
  if (usersMap && usersMap.size === 0) {
    roomState.delete(room);
  }
  socket.leave(room);
  socket.data.room = null;
  emitRoomUsers(room);
};

function marketDmRoom(listingId, a, b) {
  const u = Number(a);
  const v = Number(b);
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  const lo = Math.min(u, v);
  const hi = Math.max(u, v);
  return `market_${listingId}_${lo}_${hi}`;
}

function assertMarketChatParties(listing, uid, peerId) {
  if (!listing || uid === peerId) return false;
  const sid = listing.sellerId;
  if (uid !== sid && peerId !== sid) return false;
  const customer = uid === sid ? peerId : uid;
  if (listing.status === 'active') return true;
  if (listing.status === 'sold' && listing.buyerId && customer === listing.buyerId) return true;
  return false;
}

const leaveMarketRoom = (socket) => {
  const room = socket.data?.marketRoom;
  if (room) socket.leave(room);
  socket.data.marketRoom = null;
  socket.data.marketListingId = null;
  socket.data.marketPeerId = null;
};

const notifyUserProfileChanged = async (userId) => {
  if (!Number.isFinite(Number(userId))) return;
  const user = await User.findByPk(userId, { attributes: ['id', 'username', 'avatarUpdatedAt'] });
  if (!user) return;

  for (const [room, usersMap] of roomState.entries()) {
    const entry = usersMap?.get(userId);
    if (!entry) continue;
    entry.username = user.username;
    entry.avatarUpdatedAt = user.avatarUpdatedAt;
    emitRoomUsers(room);
  }
};

function hashSeed(seed) {
  const s = String(seed || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(arr, n) {
  const idx = Math.abs(n) % arr.length;
  return arr[idx];
}

function initialsFromName(name) {
  const s = String(name || '').trim();
  if (!s) return 'U';
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || s[0];
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
  const out = `${a || ''}${b || ''}`.toUpperCase();
  return out.slice(0, 2) || 'U';
}

function avatarSvgGradient({ seed, name }) {
  const h = hashSeed(seed);
  const colorsA = ['#2F7CFF', '#7B61FF', '#FF4D4F', '#13C2C2', '#FAAD14', '#52C41A'];
  const colorsB = ['#52B6FF', '#F759AB', '#FF7A45', '#36CFC9', '#FFD666', '#73D13D'];
  const c1 = pick(colorsA, h);
  const c2 = pick(colorsB, h >>> 3);
  const txt = initialsFromName(name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="128" fill="url(#g)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="92" font-weight="700" fill="rgba(255,255,255,0.95)">${txt}</text>
</svg>`;
}

function avatarSvgMono({ seed, name }) {
  const h = hashSeed(seed);
  const bg = pick(['#111827', '#1c1c1c', '#0b1b2b', '#0f172a', '#334155'], h);
  const fg = pick(['#ffffff', '#e5e7eb', '#f8fafc'], h >>> 5);
  const txt = initialsFromName(name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="128" fill="${bg}"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="92" font-weight="700" fill="${fg}">${txt}</text>
</svg>`;
}

function avatarSvgRing({ seed, name }) {
  const h = hashSeed(seed);
  const c1 = pick(['#1677ff', '#9254de', '#ff4d4f', '#13c2c2', '#faad14'], h);
  const c2 = pick(['#69c0ff', '#f759ab', '#ff7a45', '#5cdbd3', '#ffd666'], h >>> 4);
  const txt = initialsFromName(name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="128" fill="rgba(0,0,0,0.04)"/>
  <circle cx="128" cy="128" r="112" fill="rgba(255,255,255,0.9)"/>
  <circle cx="128" cy="128" r="112" fill="none" stroke="url(#rg)" stroke-width="14"/>
  <circle cx="128" cy="128" r="86" fill="rgba(255,255,255,0.75)" stroke="rgba(0,0,0,0.06)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="92" font-weight="700" fill="rgba(28,28,28,0.88)">${txt}</text>
</svg>`;
}

function avatarSvgPixel({ seed }) {
  const h = hashSeed(seed);
  const bg = pick(['#111827', '#0B1B2B', '#1F2937', '#3B0764'], h);
  const fg = pick(['#60A5FA', '#F59E0B', '#34D399', '#F472B6', '#A78BFA'], h >>> 5);
  const cells = 8;
  const size = 256 / cells;
  const bits = [];
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < Math.ceil(cells / 2); x += 1) {
      const bit = (h >>> ((x + y * 5) % 24)) & 1;
      if (!bit) continue;
      bits.push({ x, y });
      if (x !== cells - 1 - x) bits.push({ x: cells - 1 - x, y });
    }
  }
  const rects = bits.map((b) => `<rect x="${b.x * size}" y="${b.y * size}" width="${size}" height="${size}" rx="${size * 0.2}" fill="${fg}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="128" fill="${bg}"/>
  <g transform="translate(0 0)">${rects}</g>
</svg>`;
}

function avatarSvgBlob({ seed, name }) {
  const h = hashSeed(seed);
  const c1 = pick(['#FF7A45', '#FF85C0', '#36CFC9', '#9254DE', '#FFC53D'], h);
  const c2 = pick(['#FFD666', '#69C0FF', '#95DE64', '#FF4D4F', '#5CDBD3'], h >>> 7);
  const txt = pick(['#0b1b2b', '#1c1c1c', '#111827'], h >>> 11);
  const a = (h % 40) + 70;
  const b = ((h >>> 6) % 40) + 70;
  const c = ((h >>> 12) % 40) + 70;
  const d = ((h >>> 18) % 40) + 70;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="128" fill="rgba(0,0,0,0.04)"/>
  <path d="M128 26 C ${128 + a} 26, 230 ${128 - b}, 230 128 C 230 ${128 + c}, ${128 + d} 230, 128 230 C ${128 - a} 230, 26 ${128 + b}, 26 128 C 26 ${128 - c}, ${128 - d} 26, 128 26 Z" fill="url(#g)"/>
  <circle cx="128" cy="128" r="74" fill="rgba(255,255,255,0.75)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="92" font-weight="700" fill="${txt}">${initialsFromName(name)}</text>
</svg>`;
}

function buildPresetAvatarSvg({ style, seed, name }) {
  const s = String(style || 'gradient').toLowerCase();
  if (s === 'pixel') return avatarSvgPixel({ seed });
  if (s === 'blob') return avatarSvgBlob({ seed, name });
  if (s === 'ring') return avatarSvgRing({ seed, name });
  if (s === 'mono') return avatarSvgMono({ seed, name });
  return avatarSvgGradient({ seed, name });
}

function startOfTodayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function cutoffTwoDays() {
  return new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
}

if (shouldMount('auth')) {
router.get('/', (ctx) => {
  ctx.body = { msg: 'Hello from Virtual Art Hub Koa Backend!' };
});
}

/** 公开直达（query.code），须尽早注册以免与其它 /galleries 路由混淆 */
if (shouldMount('gallery')) {
router.get('/public/gallery-by-code', async (ctx) => {
  try {
    const page = ctx.query.page ? Math.max(1, Number(ctx.query.page)) : 1;
    const pageSize = ctx.query.pageSize ? Math.max(1, Math.min(100, Number(ctx.query.pageSize))) : 12;
    const rawCode = ctx.query.code != null ? String(ctx.query.code) : '';
    const result = await getPublicDirectPayload(rawCode, page, pageSize);
    if (!result.ok) {
      ctx.status = result.status;
      ctx.body = {
        ...result.body,
        reason: result.status === 404 ? 'gallery_not_found' : result.status === 403 ? 'public_access_disabled' : 'bad_request',
      };
      return;
    }
    ctx.body = result.payload;
  } catch (e) {
    console.error('public/gallery-by-code', e);
    ctx.status = 500;
    ctx.body = { msg: 'Server error', reason: 'server_error' };
  }
});

router.get('/public/health', (ctx) => {
  ctx.body = { ok: true, routes: ['public/gallery-by-code'] };
});
}

if (shouldMount('auth')) {
router.post('/auth/register', rateLimitRegister, async (ctx) => {
  const { username, email, password } = ctx.request.body || {};
  if (!username || !email || !password) {
    ctx.status = 400;
    ctx.body = { msg: 'Missing required fields' };
    return;
  }
  const pw = String(password);
  if (pw.length < 8 || pw.length > 128) {
    ctx.status = 400;
    ctx.body = { msg: 'Password must be between 8 and 128 characters' };
    return;
  }
  if (String(username).length > 64 || String(email).length > 254) {
    ctx.status = 400;
    ctx.body = { msg: 'Username or email too long' };
    return;
  }
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    ctx.status = 400;
    ctx.body = { msg: 'User already exists' };
    return;
  }
  const user = await User.create({ username, email, password });
  ctx.body = { token: signToken(user.id) };
});

router.post('/auth/login', rateLimitLogin, async (ctx) => {
  const { email, password } = ctx.request.body || {};
  if (!email || !password) {
    ctx.status = 400;
    ctx.body = { msg: 'Missing email or password' };
    return;
  }
  const user = await User.findOne({ where: { email } });
  if (!user) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid Credentials' };
    return;
  }
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid Credentials' };
    return;
  }
  ctx.body = { token: signToken(user.id) };
});

router.get('/auth/user', auth, async (ctx) => {
  const user = await User.findByPk(ctx.state.user.id, { attributes: { exclude: ['password'] } });
  if (!user) {
    ctx.status = 404;
    ctx.body = { msg: 'User not found' };
    return;
  }
  ctx.body = user;
});

router.put('/auth/profile', auth, async (ctx) => {
  const { username } = ctx.request.body || {};
  const user = await User.findByPk(ctx.state.user.id);
  if (!user) {
    ctx.status = 404;
    ctx.body = { msg: 'User not found' };
    return;
  }
  const nextUsername = username ? String(username).trim() : '';
  if (nextUsername) user.username = nextUsername;
  await user.save();
  await notifyUserProfileChanged(user.id);
  ctx.body = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    avatarPreset: user.avatarPreset || null,
    avatarUpdatedAt: user.avatarUpdatedAt || null,
  };
});

router.put('/auth/avatar', auth, async (ctx) => {
  const user = await User.findByPk(ctx.state.user.id);
  if (!user) {
    ctx.status = 404;
    ctx.body = { msg: 'User not found' };
    return;
  }

  const preset = ctx.request.body?.avatarPreset ? String(ctx.request.body.avatarPreset).toLowerCase() : '';
  const allowedPresets = new Set(['gradient', 'pixel', 'blob', 'ring', 'mono']);
  const avatarFile = normalizeFiles(ctx.request.files?.avatar)[0];

  if (preset) {
    if (!allowedPresets.has(preset)) {
      ctx.status = 400;
      ctx.body = { msg: 'Invalid avatar preset' };
      return;
    }
    user.avatarPreset = preset;
    user.avatarUploadPath = null;
    user.avatarUpdatedAt = new Date();
    await user.save();
    await notifyUserProfileChanged(user.id);
    ctx.body = { avatarPreset: user.avatarPreset, avatarUpdatedAt: user.avatarUpdatedAt };
    return;
  }

  if (avatarFile) {
    const avatarsDir = path.resolve(__dirname, '..', 'backend', 'uploads', 'avatars');
    ensureDir(avatarsDir);

    const filename = `avatar-${user.id}-${Date.now()}-${Math.random().toString(16).slice(2)}.png`;
    const destAbs = path.resolve(avatarsDir, filename);

    try {
      await sharp(avatarFile.filepath).resize(256, 256, { fit: 'cover' }).png({ quality: 90 }).toFile(destAbs);
    } finally {
      try { fs.unlinkSync(avatarFile.filepath); } catch {}
    }

    if (user.avatarUploadPath) {
      const oldAbs = safeResolveBackendPath(user.avatarUploadPath, ['uploads/avatars']);
      try {
        if (oldAbs && fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
      } catch {}
    }

    user.avatarUploadPath = toUnixPath(path.join('uploads', 'avatars', filename));
    user.avatarPreset = null;
    user.avatarUpdatedAt = new Date();
    await user.save();
    await notifyUserProfileChanged(user.id);
    ctx.body = { avatarUploadPath: user.avatarUploadPath, avatarUpdatedAt: user.avatarUpdatedAt };
    return;
  }

  ctx.status = 400;
  ctx.body = { msg: 'No avatar changes' };
});

router.get('/avatars/preset', (ctx) => {
  const style = ctx.query.style ? String(ctx.query.style).toLowerCase() : 'gradient';
  const seed = ctx.query.seed ? String(ctx.query.seed) : '0';
  const name = ctx.query.name ? String(ctx.query.name) : seed;
  const svg = buildPresetAvatarSvg({ style, seed, name });
  ctx.set('Cache-Control', 'public, max-age=3600');
  ctx.type = 'image/svg+xml';
  ctx.body = svg;
});

router.get('/users/:id/avatar', async (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid user id' };
    return;
  }
  const user = await User.findByPk(id, { attributes: ['id', 'username', 'avatarPreset', 'avatarUploadPath', 'avatarUpdatedAt'] });
  if (!user) {
    ctx.status = 404;
    ctx.body = { msg: 'User not found' };
    return;
  }

  if (user.avatarUploadPath) {
    const abs = safeResolveBackendPath(user.avatarUploadPath, ['uploads/avatars']);
    if (abs && fs.existsSync(abs)) {
      ctx.set('Cache-Control', 'public, max-age=3600');
      ctx.type = path.extname(abs) || 'image/png';
      ctx.body = fs.createReadStream(abs);
      return;
    }
  }

  const style = user.avatarPreset || 'gradient';
  const svg = buildPresetAvatarSvg({ style, seed: String(user.id), name: user.username });
  ctx.set('Cache-Control', 'public, max-age=3600');
  ctx.type = 'image/svg+xml';
  ctx.body = svg;
});
}

if (shouldMount('gallery')) {
router.get('/galleries/:id/cover-image', async (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid gallery id' };
    return;
  }
  const gallery = await Gallery.findByPk(id, { attributes: ['id', 'coverImage', 'coverMode'] });
  if (!gallery) {
    ctx.status = 404;
    ctx.body = { msg: 'Gallery not found' };
    return;
  }
  const p = gallery.coverImage ? String(gallery.coverImage) : '';
  if (!p || !p.startsWith('uploads/gallery-posters/')) {
    ctx.status = 404;
    ctx.body = { msg: 'Gallery cover image not found' };
    return;
  }
  const abs = safeResolveBackendPath(p, ['uploads/gallery-posters']);
  if (!abs || !fs.existsSync(abs)) {
    ctx.status = 404;
    ctx.body = { msg: 'Gallery cover image not found' };
    return;
  }
  ctx.set('Cache-Control', 'public, max-age=3600');
  ctx.type = path.extname(abs) || 'image/jpeg';
  ctx.body = fs.createReadStream(abs);
});

router.get('/galleries/:id/chat-messages', auth, async (ctx) => {
  const galleryId = Number(ctx.params.id);
  if (!Number.isFinite(galleryId)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid gallery id' };
    return;
  }

  const limitRaw = Number(ctx.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(80, limitRaw)) : 30;
  const scope = ctx.query.scope ? String(ctx.query.scope).toLowerCase() : '';
  const beforeId = ctx.query.beforeId != null ? Number(ctx.query.beforeId) : null;
  const beforeCreatedAt = ctx.query.beforeCreatedAt ? new Date(String(ctx.query.beforeCreatedAt)) : null;

  const where = {
    galleryId,
    createdAt: { [Op.gte]: cutoffTwoDays() },
  };

  if (scope === 'today') {
    where.createdAt = { [Op.gte]: startOfTodayLocal() };
  }

  if (beforeCreatedAt && Number.isFinite(beforeCreatedAt.getTime())) {
    where[Op.or] = [
      { createdAt: { [Op.lt]: beforeCreatedAt } },
      ...(Number.isFinite(beforeId) ? [{ createdAt: beforeCreatedAt, id: { [Op.lt]: beforeId } }] : []),
    ];
  } else if (Number.isFinite(beforeId)) {
    where.id = { [Op.lt]: beforeId };
  }

  const rows = await db.GalleryChatMessage.findAll({
    where,
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
  });

  const itemsDesc = rows.map((r) => ({
    id: r.id,
    galleryId: r.galleryId,
    senderId: r.senderId,
    sender: r.senderName || 'Anonymous',
    clientId: r.clientId || null,
    message: r.message || '',
    createdAt: r.createdAt,
  }));

  const items = itemsDesc.slice().reverse();
  const oldest = items[0];
  ctx.body = {
    items,
    hasMore: itemsDesc.length === limit,
    nextCursor: oldest ? { beforeCreatedAt: oldest.createdAt, beforeId: oldest.id } : null,
  };
});

router.post('/galleries', auth, async (ctx) => {
  const body = ctx.request.body || {};
  const name = body.name ? String(body.name).trim() : '';
  const description = body.description ? String(body.description).trim() : '';
  const coverMode = String(body.coverMode || 'default').toLowerCase() === 'custom' ? 'custom' : 'default';
  const showTitle = boolFrom(body.showTitle, true);
  const showDescription = boolFrom(body.showDescription, true);
  const titleColor = safeColor(body.titleColor, '#1c1c1c');
  const descriptionColor = safeColor(body.descriptionColor, '#3f3f3f');
  const titleFontFamily = safeFont(body.titleFontFamily, 'Playfair Display');
  const descriptionFontFamily = safeFont(body.descriptionFontFamily, 'Lora');
  const titleFontBold = coverMode === 'custom' ? boolFrom(body.titleFontBold, true) : true;
  const descriptionFontBold = coverMode === 'custom' ? boolFrom(body.descriptionFontBold, false) : false;
  const coverOpacity = numFrom(body.coverOpacity, 0.92, 0.2, 1);
  const coverBlur = numFrom(body.coverBlur, 6, 0, 20);
  const allowChat = boolFrom(body.allowChat, true);
  const allowPublicAccess = boolFrom(body.allowPublicAccess, false);
  if (!name) {
    ctx.status = 400;
    ctx.body = { msg: 'Gallery name is required' };
    return;
  }
  if (name.length > GALLERY_NAME_MAX_LEN) {
    ctx.status = 400;
    ctx.body = { msg: `Gallery name must be at most ${GALLERY_NAME_MAX_LEN} characters` };
    return;
  }
  if (description.length > GALLERY_DESCRIPTION_MAX_LEN) {
    ctx.status = 400;
    ctx.body = { msg: `Gallery description must be at most ${GALLERY_DESCRIPTION_MAX_LEN} characters` };
    return;
  }
  let coverImage = body.coverImage ? String(body.coverImage) : null;
  const posterFile = normalizeFiles(ctx.request.files?.poster)[0];
  if (coverMode === 'custom') {
    if (!posterFile) {
      ctx.status = 400;
      ctx.body = { msg: 'Poster image is required for custom cover mode' };
      return;
    }
    coverImage = await createGalleryPosterFromUpload(posterFile, {
      scale: body.posterScale,
      offsetX: body.posterOffsetX,
      offsetY: body.posterOffsetY,
    });
  }
  const gallery = await Gallery.create({
    name,
    description,
    coverImage,
    coverMode,
    showTitle,
    showDescription,
    titleColor,
    titleFontFamily,
    titleFontBold,
    descriptionColor,
    descriptionFontFamily,
    descriptionFontBold,
    coverOpacity,
    coverBlur,
    allowChat,
    allowPublicAccess,
    publicAccessCode: allowPublicAccess ? await ensurePublicAccessCodeUnique() : null,
    userId: ctx.state.user.id,
  });
  ctx.body = gallery;
});

router.get('/galleries', async (ctx) => {
  const q = ctx.query.q ? String(ctx.query.q).trim() : '';
  const page = ctx.query.page ? Math.max(1, Number(ctx.query.page)) : 1;
  const pageSize = ctx.query.pageSize ? Math.max(1, Math.min(100, Number(ctx.query.pageSize))) : 30;
  const Op = Sequelize.Op;

  const where = {
    [Op.and]: [
      Sequelize.where(
        Sequelize.literal(`(
          SELECT COUNT(*)
          FROM ArtPieces AS apf
          WHERE apf.galleryId = Gallery.id AND apf.status = 'approved'
        )`),
        Op.gt,
        0
      ),
    ],
  };
  const forChat = String(ctx.query.forChat || '').toLowerCase();
  if (forChat === '1' || forChat === 'true') {
    where[Op.and].push({ allowChat: true });
  }
  if (q) {
    where[Op.and].push({
      [Op.or]: [
        { name: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } },
      ],
    });
  }

  const { rows, count } = await Gallery.findAndCountAll({
    where,
    attributes: {
      include: [
        [
          Sequelize.literal(`(
            SELECT AVG(score)
            FROM Ratings AS r
            JOIN ArtPieces AS ap ON r.artPieceId = ap.id
            WHERE ap.galleryId = Gallery.id
          )`),
          'averageRating',
        ],
        [
          Sequelize.literal(`(
            SELECT COUNT(*)
            FROM ArtPieces AS ap
            WHERE ap.galleryId = Gallery.id AND ap.status = 'approved'
          )`),
          'artPiecesCount',
        ],
        [
          Sequelize.literal(`(
            SELECT ap.id
            FROM ArtPieces AS ap
            WHERE ap.galleryId = Gallery.id AND ap.status = 'approved'
            ORDER BY ap.id DESC
            LIMIT 1
          )`),
          'coverArtId',
        ],
      ],
    },
    include: [{ model: User, as: 'user', attributes: ['username'] }],
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });

  ctx.body = {
    items: rows,
    total: typeof count === 'number' ? count : count?.length || 0,
    page,
    pageSize,
  };
});

router.get('/galleries/my-galleries', auth, async (ctx) => {
  const page = ctx.query.page ? Math.max(1, Number(ctx.query.page)) : 1;
  const pageSize = ctx.query.pageSize ? Math.max(1, Math.min(100, Number(ctx.query.pageSize))) : 20;

  const { rows, count } = await Gallery.findAndCountAll({
    where: { userId: ctx.state.user.id },
    attributes: {
      include: [
        [
          Sequelize.literal(`(
            SELECT COUNT(*)
            FROM ArtPieces AS ap
            WHERE ap.galleryId = Gallery.id
          )`),
          'artPiecesCount',
        ],
        [
          Sequelize.literal(`(
            SELECT ap.id
            FROM ArtPieces AS ap
            WHERE ap.galleryId = Gallery.id
            ORDER BY ap.id DESC
            LIMIT 1
          )`),
          'coverArtId',
        ],
      ],
    },
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });

  ctx.body = {
    items: rows,
    total: typeof count === 'number' ? count : count?.length || 0,
    page,
    pageSize,
  };
});

/** 比 /galleries/direct/:code 更具体，须先注册 */
router.get('/galleries/direct/:code/artpieces', async (ctx) => {
  const page = ctx.query.page ? Math.max(1, Number(ctx.query.page)) : 1;
  const pageSize = ctx.query.pageSize ? Math.max(1, Math.min(100, Number(ctx.query.pageSize))) : 12;
  const result = await getPublicDirectPayload(ctx.params.code, page, pageSize);
  if (!result.ok) {
    ctx.status = result.status;
    ctx.body = result.body;
    return;
  }
  ctx.body = result.payload;
});

/** 必须在 /galleries/:id 之前注册，避免部分路由实现将路径误匹配为 id */
router.get('/galleries/direct/:code', async (ctx) => {
  const resolved = await resolveGalleryForPublicDirectAccess(ctx.params.code);
  if (!resolved.ok) {
    ctx.status = resolved.status;
    ctx.body = resolved.body;
    return;
  }
  ctx.body = resolved.gallery.get({ plain: true });
});

router.get('/galleries/:id', async (ctx) => {
  const includeArtPiecesRaw = ctx.query.includeArtPieces;
  const includeArtPieces = includeArtPiecesRaw === undefined ? true : !(String(includeArtPiecesRaw) === '0' || String(includeArtPiecesRaw).toLowerCase() === 'false');
  const allowEmpty = String(ctx.query.allowEmpty || '') === '1' || String(ctx.query.allowEmpty || '').toLowerCase() === 'true';

  const gallery = await Gallery.findByPk(ctx.params.id, {
    include: [
      { model: User, as: 'user', attributes: ['username'] },
      ...(includeArtPieces ? [{ model: ArtPiece, as: 'artPieces', where: { status: 'approved' }, required: false }] : []),
    ],
  });
  if (!gallery) {
    ctx.status = 404;
    ctx.body = { msg: 'Gallery not found' };
    return;
  }
  if (!allowEmpty) {
    const approvedCount = await ArtPiece.count({ where: { galleryId: gallery.id, status: 'approved' } });
    if (!approvedCount) {
      ctx.status = 404;
      ctx.body = { msg: 'Gallery not found' };
      return;
    }
  }
  ctx.body = gallery;
});

router.get('/galleries/:id/artpieces', async (ctx) => {
  const galleryId = Number(ctx.params.id);
  if (!Number.isFinite(galleryId)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid gallery id' };
    return;
  }

  const page = ctx.query.page ? Math.max(1, Number(ctx.query.page)) : 1;
  const pageSize = ctx.query.pageSize ? Math.max(1, Math.min(100, Number(ctx.query.pageSize))) : 12;

  const { rows, count } = await ArtPiece.findAndCountAll({
    where: { galleryId, status: 'approved' },
    attributes: {
      include: [
        [
          Sequelize.literal(`(
            SELECT AVG(allr.score)
            FROM (
              SELECT r.score AS score FROM Ratings AS r WHERE r.artPieceId = ArtPiece.id
              UNION ALL
              SELECT gr.score AS score FROM GuestRatings AS gr WHERE gr.artPieceId = ArtPiece.id
            ) AS allr
          )`),
          'averageRating',
        ],
        [
          Sequelize.literal(`(
            SELECT COUNT(*)
            FROM (
              SELECT r.id AS id FROM Ratings AS r WHERE r.artPieceId = ArtPiece.id
              UNION ALL
              SELECT gr.id AS id FROM GuestRatings AS gr WHERE gr.artPieceId = ArtPiece.id
            ) AS allc
          )`),
          'ratingCount',
        ],
      ],
    },
    order: [
      ['episodeNumber', 'ASC'],
      ['id', 'ASC'],
    ],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });

  ctx.body = {
    items: rows,
    total: typeof count === 'number' ? count : count?.length || 0,
    page,
    pageSize,
  };
});

router.get('/galleries/:id/artpieces/owner', auth, async (ctx) => {
  const galleryId = Number(ctx.params.id);
  if (!Number.isFinite(galleryId)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid gallery id' };
    return;
  }

  const gallery = await Gallery.findByPk(galleryId);
  if (!gallery) {
    ctx.status = 404;
    ctx.body = { msg: 'Gallery not found' };
    return;
  }
  const isOwner = gallery.userId === ctx.state.user.id;
  if (!isOwner) {
    const actor = await User.findByPk(ctx.state.user.id, { attributes: ['role'] });
    if (actor?.role !== 'admin') {
      ctx.status = 403;
      ctx.body = { msg: 'Forbidden' };
      return;
    }
  }

  const page = ctx.query.page ? Math.max(1, Number(ctx.query.page)) : 1;
  const pageSize = ctx.query.pageSize ? Math.max(1, Math.min(100, Number(ctx.query.pageSize))) : 12;

  const { rows, count } = await ArtPiece.findAndCountAll({
    where: { galleryId },
    include: [{ model: User, as: 'user', attributes: ['username', 'email'] }],
    order: [
      ['episodeNumber', 'ASC'],
      ['id', 'ASC'],
    ],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });

  ctx.body = {
    items: rows,
    total: typeof count === 'number' ? count : count?.length || 0,
    page,
    pageSize,
  };
});

router.put('/galleries/:id', auth, async (ctx) => {
  const body = ctx.request.body || {};
  const gallery = await Gallery.findOne({ where: { id: ctx.params.id, userId: ctx.state.user.id } });
  if (!gallery) {
    ctx.status = 404;
    ctx.body = { msg: 'Gallery not found or unauthorized' };
    return;
  }
  if (body.name !== undefined) {
    const nextName = String(body.name || '').trim();
    if (!nextName) {
      ctx.status = 400;
      ctx.body = { msg: 'Gallery name is required' };
      return;
    }
    if (nextName.length > GALLERY_NAME_MAX_LEN) {
      ctx.status = 400;
      ctx.body = { msg: `Gallery name must be at most ${GALLERY_NAME_MAX_LEN} characters` };
      return;
    }
    gallery.name = nextName;
  }
  if (body.description !== undefined) {
    const nextDesc = String(body.description || '').trim();
    if (nextDesc.length > GALLERY_DESCRIPTION_MAX_LEN) {
      ctx.status = 400;
      ctx.body = { msg: `Gallery description must be at most ${GALLERY_DESCRIPTION_MAX_LEN} characters` };
      return;
    }
    gallery.description = nextDesc;
  }

  const nextCoverMode = body.coverMode !== undefined ? (String(body.coverMode).toLowerCase() === 'custom' ? 'custom' : 'default') : gallery.coverMode || 'default';
  gallery.coverMode = nextCoverMode;
  gallery.showTitle = boolFrom(body.showTitle, gallery.showTitle !== false);
  gallery.showDescription = boolFrom(body.showDescription, gallery.showDescription !== false);
  gallery.titleColor = safeColor(body.titleColor, gallery.titleColor || '#1c1c1c');
  gallery.descriptionColor = safeColor(body.descriptionColor, gallery.descriptionColor || '#3f3f3f');
  gallery.titleFontFamily = safeFont(body.titleFontFamily, gallery.titleFontFamily || 'Playfair Display');
  gallery.descriptionFontFamily = safeFont(body.descriptionFontFamily, gallery.descriptionFontFamily || 'Lora');
  if (body.titleFontBold !== undefined) {
    gallery.titleFontBold = boolFrom(body.titleFontBold, gallery.titleFontBold !== false);
  }
  if (body.descriptionFontBold !== undefined) {
    gallery.descriptionFontBold = boolFrom(body.descriptionFontBold, gallery.descriptionFontBold === true);
  }
  gallery.coverOpacity = numFrom(body.coverOpacity, Number(gallery.coverOpacity) || 0.92, 0.2, 1);
  gallery.coverBlur = numFrom(body.coverBlur, Number(gallery.coverBlur) || 6, 0, 20);
  gallery.allowChat = boolFrom(body.allowChat, gallery.allowChat !== false);
  const nextAllowPublicAccess = boolFrom(body.allowPublicAccess, gallery.allowPublicAccess === true);
  gallery.allowPublicAccess = nextAllowPublicAccess;
  if (nextAllowPublicAccess) {
    if (!gallery.publicAccessCode) gallery.publicAccessCode = await ensurePublicAccessCodeUnique();
  }
  /** 关闭公开访问时保留 publicAccessCode，避免旧链接/二维码在再次开启前永久失效（仅关开关时不再清空码） */

  if (body.coverImage !== undefined && nextCoverMode === 'default') {
    gallery.coverImage = body.coverImage ? String(body.coverImage) : null;
  }

  const posterFile = normalizeFiles(ctx.request.files?.poster)[0];
  if (nextCoverMode === 'custom' && posterFile) {
    const nextPoster = await createGalleryPosterFromUpload(posterFile, {
      scale: body.posterScale,
      offsetX: body.posterOffsetX,
      offsetY: body.posterOffsetY,
    });
    if (gallery.coverImage && String(gallery.coverImage).startsWith('uploads/gallery-posters/')) {
      const oldAbs = safeResolveBackendPath(gallery.coverImage, ['uploads/gallery-posters']);
      try {
        if (oldAbs && fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
      } catch {}
    }
    gallery.coverImage = nextPoster;
  }

  await gallery.save();
  ctx.body = gallery;
});

router.delete('/galleries/:id', auth, async (ctx) => {
  const gallery = await Gallery.findOne({ where: { id: ctx.params.id, userId: ctx.state.user.id } });
  if (!gallery) {
    ctx.status = 404;
    ctx.body = { msg: 'Gallery not found or unauthorized' };
    return;
  }
  if (gallery.coverImage && String(gallery.coverImage).startsWith('uploads/gallery-posters/')) {
    const abs = safeResolveBackendPath(gallery.coverImage, ['uploads/gallery-posters']);
    try {
      if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {}
  }
  await gallery.destroy();
  ctx.body = { msg: 'Gallery removed' };
});

router.get('/artpieces/public/:id', async (ctx) => {
  const artPiece = await ArtPiece.findByPk(ctx.params.id, {
    include: [{ model: User, as: 'user', attributes: ['username', 'email'] }],
  });
  if (!artPiece) {
    ctx.status = 404;
    ctx.body = { msg: 'Art piece not found' };
    return;
  }
  if (artPiece.status !== 'approved') {
    ctx.status = 403;
    ctx.body = { msg: 'Art piece is not public' };
    return;
  }
  ctx.body = artPiece;
});

router.get('/artpieces/my-art', auth, async (ctx) => {
  const artPieces = await ArtPiece.findAll({
    where: { userId: ctx.state.user.id },
    include: [{ model: User, as: 'user', attributes: ['username', 'email'] }],
  });
  ctx.body = artPieces;
});

router.post('/artpieces', auth, async (ctx) => {
  const { title, description, allowDownload, galleryId, artType, textContent, seriesTitle, episodeNumber, episodeTitle } = ctx.request.body || {};
  const type = artType || 'photography';
  const files = normalizeFiles(ctx.request.files ? ctx.request.files.artPiece : null);

  ensureDir(path.resolve(__dirname, '..', 'backend', 'uploads'));
  ensureDir(path.resolve(__dirname, '..', 'backend', 'uploads', 'watermarked'));

  const allow = allowDownload === 'true' ? true : allowDownload === 'false' ? false : true;
  let filePath = null;
  let watermarkedFilePath = null;
  let extraFilePaths = null;
  let resolvedGalleryId = galleryId || null;
  let resolvedSeriesTitle = type === 'literature' && seriesTitle ? String(seriesTitle) : null;

  if (type === 'literature') {
    const sanitized = sanitizeRichText(textContent);
    if (!sanitized || !sanitized.replace(/<[^>]*>/g, '').replace(/\s+/g, '').trim()) {
      ctx.status = 400;
      ctx.body = { msg: 'Missing text content' };
      return;
    }
    ctx.request.body.textContent = sanitized;

    const seriesName = String(seriesTitle || title || '').trim();
    if (!seriesName) {
      ctx.status = 400;
      ctx.body = { msg: 'Missing series title' };
      return;
    }
    if (seriesName.length > GALLERY_NAME_MAX_LEN) {
      ctx.status = 400;
      ctx.body = { msg: `Series title must be at most ${GALLERY_NAME_MAX_LEN} characters` };
      return;
    }
    resolvedSeriesTitle = seriesName;
    const existing = await Gallery.findOne({ where: { userId: ctx.state.user.id, name: seriesName } });
    const seriesGallery = existing || (await Gallery.create({ name: seriesName, description: '文学连载系列', userId: ctx.state.user.id }));
    resolvedGalleryId = seriesGallery.id;
  } else {
    if (files.length === 0) {
      ctx.status = 400;
      ctx.body = { msg: 'Missing file' };
      return;
    }

    const prefix = type === 'video' ? 'video' : 'artPiece';
    const moved = files.map((f) => moveUploadedFile(f, prefix));
    filePath = moved[0].relativePath;
    if (moved.length > 1) {
      extraFilePaths = moved.slice(1).map((m) => m.relativePath);
    }

    if (allow === false && type !== 'video' && type !== 'literature' && isImagePath(filePath)) {
      const outputDirAbs = path.resolve(__dirname, '..', 'backend', 'uploads', 'watermarked');
      const outAbs = await applyWatermark(moved[0].destAbs, 'Virtual Art Hub', outputDirAbs);
      watermarkedFilePath = toUnixPath(path.relative(path.resolve(__dirname, '..', 'backend'), outAbs));
    }
  }

  const epNum = episodeNumber === undefined || episodeNumber === null || episodeNumber === '' ? null : Number(episodeNumber);

  const artPiece = await ArtPiece.create({
    artType: type,
    title,
    description,
    filePath,
    extraFilePaths,
    textContent: type === 'literature' ? String(ctx.request.body.textContent) : null,
    seriesTitle: type === 'literature' ? resolvedSeriesTitle : null,
    episodeNumber: type === 'literature' && Number.isFinite(epNum) ? epNum : null,
    episodeTitle: type === 'literature' && episodeTitle ? String(episodeTitle) : null,
    watermarkedFilePath,
    allowDownload: allow,
    userId: ctx.state.user.id,
    galleryId: resolvedGalleryId,
  });

  ctx.body = artPiece;
});

router.put('/artpieces/:id', auth, async (ctx) => {
  const { title, description, allowDownload, artType, textContent, seriesTitle, episodeNumber, episodeTitle } = ctx.request.body || {};
  const artPiece = await ArtPiece.findOne({ where: { id: ctx.params.id, userId: ctx.state.user.id } });
  if (!artPiece) {
    ctx.status = 404;
    ctx.body = { msg: 'Art piece not found or unauthorized' };
    return;
  }

  const nextType = artType || artPiece.artType || 'photography';
  const files = normalizeFiles(ctx.request.files ? ctx.request.files.artPiece : null);
  if (files.length > 0) {
    ensureDir(path.resolve(__dirname, '..', 'backend', 'uploads'));
    ensureDir(path.resolve(__dirname, '..', 'backend', 'uploads', 'watermarked'));

    if (artPiece.filePath) {
      const oldAbs = safeResolveBackendPath(artPiece.filePath, ['uploads']);
      if (oldAbs && fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
    }
    if (Array.isArray(artPiece.extraFilePaths)) {
      artPiece.extraFilePaths.forEach((p) => {
        const abs = safeResolveBackendPath(p, ['uploads']);
        if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
      });
    }
    if (artPiece.watermarkedFilePath) {
      const oldWmAbs = safeResolveBackendPath(artPiece.watermarkedFilePath, ['uploads']);
      if (oldWmAbs && fs.existsSync(oldWmAbs)) fs.unlinkSync(oldWmAbs);
    }

    const prefix = nextType === 'video' ? 'video' : 'artPiece';
    const moved = files.map((f) => moveUploadedFile(f, prefix));
    artPiece.filePath = moved[0].relativePath;
    artPiece.extraFilePaths = moved.length > 1 ? moved.slice(1).map((m) => m.relativePath) : null;
    artPiece.watermarkedFilePath = null;
  }

  artPiece.title = title || artPiece.title;
  artPiece.description = description || artPiece.description;
  artPiece.artType = nextType;

  if (allowDownload === 'true') artPiece.allowDownload = true;
  if (allowDownload === 'false') artPiece.allowDownload = false;

  if (artPiece.artType === 'literature') {
    if (textContent !== undefined) artPiece.textContent = sanitizeRichText(String(textContent));
    const seriesName = String(seriesTitle || artPiece.seriesTitle || artPiece.title || '').trim();
    if (seriesName.length > GALLERY_NAME_MAX_LEN) {
      ctx.status = 400;
      ctx.body = { msg: `Series title must be at most ${GALLERY_NAME_MAX_LEN} characters` };
      return;
    }
    if (seriesName) {
      artPiece.seriesTitle = seriesName;
      const existing = await Gallery.findOne({ where: { userId: ctx.state.user.id, name: seriesName } });
      const seriesGallery = existing || (await Gallery.create({ name: seriesName, description: '文学连载系列', userId: ctx.state.user.id }));
      artPiece.galleryId = seriesGallery.id;
    }
    const epNum = episodeNumber === undefined || episodeNumber === null || episodeNumber === '' ? null : Number(episodeNumber);
    artPiece.episodeNumber = Number.isFinite(epNum) ? epNum : null;
    artPiece.episodeTitle = episodeTitle ? String(episodeTitle) : null;
    artPiece.filePath = null;
    artPiece.extraFilePaths = null;
    if (artPiece.watermarkedFilePath) {
      const oldWmAbs = safeResolveBackendPath(artPiece.watermarkedFilePath, ['uploads']);
      if (oldWmAbs && fs.existsSync(oldWmAbs)) fs.unlinkSync(oldWmAbs);
    }
    artPiece.watermarkedFilePath = null;
  } else if (artPiece.allowDownload === false && artPiece.artType !== 'video' && isImagePath(artPiece.filePath)) {
    const inputAbs = safeResolveBackendPath(artPiece.filePath, ['uploads']);
    const outputDirAbs = path.resolve(__dirname, '..', 'backend', 'uploads', 'watermarked');
    if (!inputAbs) {
      ctx.status = 400;
      ctx.body = { msg: 'Invalid file path' };
      return;
    }
    const outAbs = await applyWatermark(inputAbs, 'Virtual Art Hub', outputDirAbs);
    artPiece.watermarkedFilePath = toUnixPath(path.relative(path.resolve(__dirname, '..', 'backend'), outAbs));
  } else if (artPiece.allowDownload === true && artPiece.watermarkedFilePath) {
    const oldWmAbs = safeResolveBackendPath(artPiece.watermarkedFilePath, ['uploads']);
    if (oldWmAbs && fs.existsSync(oldWmAbs)) fs.unlinkSync(oldWmAbs);
    artPiece.watermarkedFilePath = null;
  }

  await artPiece.save();
  ctx.body = artPiece;
});

router.delete('/artpieces/:id', auth, async (ctx) => {
  const artPiece = await ArtPiece.findOne({ where: { id: ctx.params.id, userId: ctx.state.user.id } });
  if (!artPiece) {
    ctx.status = 404;
    ctx.body = { msg: 'Art piece not found or unauthorized' };
    return;
  }
  if (artPiece.filePath) {
    const fileAbs = safeResolveBackendPath(artPiece.filePath, ['uploads']);
    if (fileAbs && fs.existsSync(fileAbs)) fs.unlinkSync(fileAbs);
  }
  if (Array.isArray(artPiece.extraFilePaths)) {
    artPiece.extraFilePaths.forEach((p) => {
      const abs = safeResolveBackendPath(p, ['uploads']);
      if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
    });
  }
  if (artPiece.watermarkedFilePath) {
    const wmAbs = safeResolveBackendPath(artPiece.watermarkedFilePath, ['uploads']);
    if (wmAbs && fs.existsSync(wmAbs)) fs.unlinkSync(wmAbs);
  }
  const marketRow = await MarketListing.findOne({ where: { artPieceId: artPiece.id } });
  if (marketRow) {
    await MarketCartItem.destroy({ where: { listingId: marketRow.id } });
    await MarketChatMessage.destroy({ where: { listingId: marketRow.id } });
    await marketRow.destroy();
  }
  await artPiece.destroy();
  ctx.body = { msg: 'Art piece removed' };
});

router.get('/artpieces/download/:id', async (ctx) => {
  const artPiece = await ArtPiece.findByPk(ctx.params.id);
  if (!artPiece) {
    ctx.status = 404;
    ctx.body = { msg: 'Art piece not found' };
    return;
  }
  if (!artPiece.filePath) {
    ctx.status = 404;
    ctx.body = { msg: 'File not found' };
    return;
  }
  if (!artPiece.allowDownload) {
    ctx.status = 403;
    ctx.body = { msg: 'Download is not allowed for this art piece' };
    return;
  }
  const fileAbs = safeResolveBackendPath(artPiece.filePath, ['uploads']);
  if (!fileAbs || !fs.existsSync(fileAbs)) {
    ctx.status = 404;
    ctx.body = { msg: 'File not found' };
    return;
  }
  ctx.attachment(path.basename(fileAbs));
  ctx.body = fs.createReadStream(fileAbs);
});

router.get('/artpieces/preview/:id', async (ctx) => {
  const artPiece = await ArtPiece.findByPk(ctx.params.id, { include: [{ model: User, as: 'user', attributes: ['username'] }] });
  if (!artPiece) {
    ctx.status = 404;
    ctx.body = { msg: 'Art piece not found' };
    return;
  }

  if (artPiece.artType === 'literature' || artPiece.artType === 'video' || !artPiece.filePath || !isImagePath(artPiece.filePath)) {
    ctx.set('Cache-Control', 'no-store');
    ctx.type = 'image/jpeg';
    const subtitle = artPiece.artType === 'video' ? 'VIDEO' : artPiece.artType === 'literature' ? 'LITERATURE' : 'ART';
    ctx.body = await placeholderJpeg({ title: artPiece.title, subtitle });
    return;
  }

  const watermarkEnabled = !(ctx.query.wm === '0' || ctx.query.watermark === '0');
  const fullPath = safeResolveBackendPath(artPiece.filePath, ['uploads']);
  if (!fullPath || !fs.existsSync(fullPath)) {
    ctx.status = 404;
    ctx.body = { msg: 'File not found' };
    return;
  }

  ctx.set('Cache-Control', 'no-store');
  ctx.type = 'image/jpeg';

  const originalMetadata = await sharp(fullPath).metadata();
  const ow = Number(originalMetadata.width) || 1280;
  const oh = Number(originalMetadata.height) || ow;
  const targetWidth = Math.min(ow, 1280);
  const targetHeight = Math.round(oh * (targetWidth / ow));
  const base = sharp(fullPath).resize({ width: targetWidth, withoutEnlargement: true });

  if (!watermarkEnabled) {
    ctx.body = await base.jpeg({ quality: 75 }).toBuffer();
    return;
  }

  const svg = Buffer.from(
    `<svg width="${targetWidth}" height="${targetHeight}">
      <text x="50%" y="50%" font-family="Arial" font-size="${Math.floor(Math.min(targetWidth, targetHeight) / 8)}" fill="rgba(255,255,255,0.25)"
        text-anchor="middle" dominant-baseline="middle" transform="rotate(-30, ${targetWidth / 2}, ${targetHeight / 2})">
        VIRTUAL ART HUB
      </text>
    </svg>`
  );

  ctx.body = await base
    .composite([{ input: svg, gravity: 'center' }])
    .jpeg({ quality: 75 })
    .toBuffer();
});

router.get('/interactions/comments/:artPieceId', async (ctx) => {
  const comments = await Comment.findAll({
    where: { artPieceId: ctx.params.artPieceId },
    include: [{ model: User, as: 'user', attributes: ['username'] }],
    order: [['createdAt', 'DESC']],
  });
  ctx.body = comments;
});

router.post('/interactions/comment/:artPieceId', auth, async (ctx) => {
  const rawContent = ctx.request.body?.content;
  const content = sanitizeRichText(rawContent != null ? String(rawContent) : '').slice(0, 4000);
  const plain = content.replace(/<[^>]*>/g, '').replace(/\s+/g, '').trim();
  if (!plain) {
    ctx.status = 400;
    ctx.body = { msg: 'Empty comment' };
    return;
  }
  const artPiece = await ArtPiece.findByPk(ctx.params.artPieceId);
  if (!artPiece) {
    ctx.status = 404;
    ctx.body = { msg: 'Art piece not found' };
    return;
  }
  const comment = await Comment.create({
    content,
    artPieceId: ctx.params.artPieceId,
    userId: ctx.state.user.id,
  });
  const commentWithUser = await Comment.findByPk(comment.id, {
    include: [{ model: User, as: 'user', attributes: ['username'] }],
  });
  ctx.body = commentWithUser;
});

router.get('/interactions/rating/:artPieceId', async (ctx) => {
  const artPieceId = Number(ctx.params.artPieceId);
  if (!Number.isFinite(artPieceId)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid art piece id' };
    return;
  }

  const [userAgg, guestAgg] = await Promise.all([
    Rating.findAll({
      where: { artPieceId },
      attributes: [
        [Sequelize.fn('SUM', Sequelize.col('score')), 'scoreSum'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'ratingCount'],
      ],
      raw: true,
    }),
    GuestRating.findAll({
      where: { artPieceId },
      attributes: [
        [Sequelize.fn('SUM', Sequelize.col('score')), 'scoreSum'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'ratingCount'],
      ],
      raw: true,
    }),
  ]);

  const uSum = Number(userAgg?.[0]?.scoreSum) || 0;
  const uCnt = Number(userAgg?.[0]?.ratingCount) || 0;
  const gSum = Number(guestAgg?.[0]?.scoreSum) || 0;
  const gCnt = Number(guestAgg?.[0]?.ratingCount) || 0;
  const totalCnt = uCnt + gCnt;
  const avg = totalCnt ? (uSum + gSum) / totalCnt : 0;

  ctx.body = { averageRating: avg, ratingCount: totalCnt };
});

router.get('/interactions/rating/:artPieceId/me', auth, async (ctx) => {
  const rating = await Rating.findOne({
    where: { artPieceId: ctx.params.artPieceId, userId: ctx.state.user.id },
  });
  ctx.body = rating ? { score: rating.score } : { score: 0 };
});

router.get('/interactions/rating/:artPieceId/guest/me', async (ctx) => {
  const artPieceId = Number(ctx.params.artPieceId);
  if (!Number.isFinite(artPieceId)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid art piece id' };
    return;
  }
  const guestId = ctx.get('x-guest-id') ? String(ctx.get('x-guest-id')).trim() : '';
  if (!guestId) {
    ctx.body = { score: 0 };
    return;
  }
  const rating = await GuestRating.findOne({ where: { artPieceId, guestId } });
  ctx.body = rating ? { score: rating.score } : { score: 0 };
});

router.post('/interactions/rate/:artPieceId', auth, async (ctx) => {
  const { score } = ctx.request.body || {};
  const n = Number(score);
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    ctx.status = 400;
    ctx.body = { msg: 'Rating must be between 1 and 5' };
    return;
  }
  const artPiece = await ArtPiece.findByPk(ctx.params.artPieceId);
  if (!artPiece) {
    ctx.status = 404;
    ctx.body = { msg: 'Art piece not found' };
    return;
  }
  let rating = await Rating.findOne({
    where: { artPieceId: ctx.params.artPieceId, userId: ctx.state.user.id },
  });
  if (rating) {
    rating.score = n;
    await rating.save();
  } else {
    rating = await Rating.create({
      score: n,
      artPieceId: ctx.params.artPieceId,
      userId: ctx.state.user.id,
    });
  }
  ctx.body = rating;
});

router.post('/interactions/rate/:artPieceId/guest', async (ctx) => {
  const artPieceId = Number(ctx.params.artPieceId);
  if (!Number.isFinite(artPieceId)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid art piece id' };
    return;
  }
  const { score } = ctx.request.body || {};
  const n = Number(score);
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    ctx.status = 400;
    ctx.body = { msg: 'Rating must be between 1 and 5' };
    return;
  }
  const guestId = ctx.get('x-guest-id') ? String(ctx.get('x-guest-id')).trim() : '';
  if (!guestId || guestId.length > 64) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid guest id' };
    return;
  }
  const artPiece = await ArtPiece.findByPk(artPieceId);
  if (!artPiece) {
    ctx.status = 404;
    ctx.body = { msg: 'Art piece not found' };
    return;
  }

  let rating = await GuestRating.findOne({ where: { artPieceId, guestId } });
  if (rating) {
    rating.score = n;
    await rating.save();
  } else {
    rating = await GuestRating.create({ score: n, artPieceId, guestId });
  }
  ctx.body = rating.get({ plain: true });
});

router.get('/admin/artpieces/pending', adminAuth, async (ctx) => {
  const pendingArtPieces = await ArtPiece.findAll({
    where: { status: 'pending' },
    include: [{ model: User, as: 'user', attributes: ['username', 'email'] }],
  });
  ctx.body = pendingArtPieces;
});

router.put('/admin/artpieces/:id/approve', adminAuth, async (ctx) => {
  const artPiece = await ArtPiece.findByPk(ctx.params.id);
  if (!artPiece) {
    ctx.status = 404;
    ctx.body = { msg: 'Art piece not found' };
    return;
  }
  artPiece.status = 'approved';
  await artPiece.save();
  ctx.body = artPiece;
});

router.put('/admin/artpieces/:id/reject', adminAuth, async (ctx) => {
  const artPiece = await ArtPiece.findByPk(ctx.params.id);
  if (!artPiece) {
    ctx.status = 404;
    ctx.body = { msg: 'Art piece not found' };
    return;
  }
  artPiece.status = 'rejected';
  await artPiece.save();
  ctx.body = artPiece;
});
}

if (shouldMount('auth')) {
router.get('/admin/users', adminAuth, async (ctx) => {
  const q = ctx.query.q ? String(ctx.query.q).trim() : '';
  const role = ctx.query.role ? String(ctx.query.role).trim() : '';
  const page = ctx.query.page ? Math.max(1, Number(ctx.query.page)) : 1;
  const pageSize = ctx.query.pageSize ? Math.max(1, Math.min(100, Number(ctx.query.pageSize))) : 20;

  const where = {};
  if (role === 'admin' || role === 'user') where.role = role;
  if (q) {
    where[Sequelize.Op.or] = [
      { username: { [Sequelize.Op.like]: `%${q}%` } },
      { email: { [Sequelize.Op.like]: `%${q}%` } },
    ];
  }

  const { rows, count } = await User.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
    attributes: [
      'id',
      'username',
      'email',
      'role',
      'createdAt',
      'updatedAt',
      [Sequelize.literal('(SELECT COUNT(*) FROM ArtPieces ap WHERE ap.userId = User.id)'), 'artworksCount'],
      [Sequelize.literal('(SELECT COUNT(*) FROM Galleries g WHERE g.userId = User.id)'), 'galleriesCount'],
      [
        Sequelize.literal(
          "(SELECT COUNT(*) FROM MarketListings ml WHERE ml.sellerId = User.id AND ml.status = 'active')"
        ),
        'marketActiveListingsCount',
      ],
    ],
  });

  ctx.body = {
    items: rows,
    total: typeof count === 'number' ? count : count?.length || 0,
    page,
    pageSize,
  };
});

router.put('/admin/users/:id/role', adminAuth, async (ctx) => {
  const targetId = Number(ctx.params.id);
  const role = ctx.request.body?.role ? String(ctx.request.body.role) : '';
  if (!Number.isFinite(targetId)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid user id' };
    return;
  }
  if (role !== 'admin' && role !== 'user') {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid role' };
    return;
  }
  if (targetId === ctx.state.user.id && role !== 'admin') {
    ctx.status = 400;
    ctx.body = { msg: 'Cannot change your own role' };
    return;
  }
  const target = await User.findByPk(targetId);
  if (!target) {
    ctx.status = 404;
    ctx.body = { msg: 'User not found' };
    return;
  }
  target.role = role;
  await target.save();
  ctx.body = { id: target.id, role: target.role };
});

router.put('/admin/users/:id/password', adminAuth, async (ctx) => {
  const targetId = Number(ctx.params.id);
  const password = ctx.request.body?.password ? String(ctx.request.body.password) : '';
  if (!Number.isFinite(targetId)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid user id' };
    return;
  }
  if (!password || password.length < 6) {
    ctx.status = 400;
    ctx.body = { msg: 'Password must be at least 6 characters' };
    return;
  }
  const target = await User.findByPk(targetId);
  if (!target) {
    ctx.status = 404;
    ctx.body = { msg: 'User not found' };
    return;
  }
  target.password = password;
  await target.save();
  ctx.body = { id: target.id };
});

router.delete('/admin/users/:id', adminAuth, async (ctx) => {
  const targetId = Number(ctx.params.id);
  if (!Number.isFinite(targetId)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid user id' };
    return;
  }
  if (targetId === ctx.state.user.id) {
    ctx.status = 400;
    ctx.body = { msg: 'Cannot delete yourself' };
    return;
  }

  const target = await User.findByPk(targetId);
  if (!target) {
    ctx.status = 404;
    ctx.body = { msg: 'User not found' };
    return;
  }

  const artPiecesForFiles = await ArtPiece.findAll({
    where: { userId: targetId },
    attributes: ['filePath', 'watermarkedFilePath', 'extraFilePaths'],
  });

  await db.sequelize.transaction(async (tx) => {
    const artPieceIds = (await ArtPiece.findAll({ where: { userId: targetId }, attributes: ['id'], transaction: tx })).map((a) => a.id);

    if (artPieceIds.length > 0) {
      await Comment.destroy({ where: { artPieceId: { [Sequelize.Op.in]: artPieceIds } }, transaction: tx });
      await Rating.destroy({ where: { artPieceId: { [Sequelize.Op.in]: artPieceIds } }, transaction: tx });
    }

    await Comment.destroy({ where: { userId: targetId }, transaction: tx });
    await Rating.destroy({ where: { userId: targetId }, transaction: tx });

    await MarketChatMessage.destroy({
      where: { [Sequelize.Op.or]: [{ fromUserId: targetId }, { toUserId: targetId }] },
      transaction: tx,
    });
    await MarketCartItem.destroy({ where: { userId: targetId }, transaction: tx });
    const sellerListings = await MarketListing.findAll({
      where: { sellerId: targetId },
      attributes: ['id'],
      transaction: tx,
    });
    const sellerListingIds = sellerListings.map((r) => r.id);
    if (sellerListingIds.length > 0) {
      await MarketCartItem.destroy({ where: { listingId: { [Sequelize.Op.in]: sellerListingIds } }, transaction: tx });
      await MarketChatMessage.destroy({ where: { listingId: { [Sequelize.Op.in]: sellerListingIds } }, transaction: tx });
      await MarketListing.destroy({ where: { id: { [Sequelize.Op.in]: sellerListingIds } }, transaction: tx });
    }
    await MarketListing.update({ buyerId: null }, { where: { buyerId: targetId }, transaction: tx });

    await ArtPiece.destroy({ where: { userId: targetId }, transaction: tx });
    await Gallery.destroy({ where: { userId: targetId }, transaction: tx });
    await User.destroy({ where: { id: targetId }, transaction: tx });
  });

  artPiecesForFiles.forEach((ap) => {
    const candidates = [];
    if (ap.filePath) candidates.push(ap.filePath);
    if (ap.watermarkedFilePath) candidates.push(ap.watermarkedFilePath);
    if (Array.isArray(ap.extraFilePaths)) candidates.push(...ap.extraFilePaths);
    candidates.forEach((p) => {
      try {
        const abs = safeResolveBackendPath(p, ['uploads']);
        if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch {
        // ignore
      }
    });
  });

  ctx.body = { id: targetId };
});
}

/** 市场搜索：种类关键词（含中英文）→ ArtPiece.artType 精确匹配 */
if (shouldMount('market')) {
function marketArtTypeOrFromQuery(qRaw) {
  const qLower = String(qRaw || '').trim().toLowerCase();
  if (!qLower) return [];
  const map = [
    ['photography', ['photography', 'photo', 'photograph', '摄影', '摄像', '照片']],
    ['painting', ['painting', 'paint', '绘画', '油画', '水彩', '素描']],
    ['calligraphy', ['calligraphy', '书法', '法书', '字', '毛筆', '毛笔', 'ink', 'ink art']],
    ['video', ['video', '影视', '视频', '电影', '录像', 'film', 'movie']],
    ['literature', ['literature', '文学', '小说', '诗', '散文', '书', 'book', 'poem']],
    ['object', ['object', '雕塑', '装置', '立体', '器物']],
  ];
  const out = [];
  for (const [enumVal, keys] of map) {
    if (keys.some((k) => qLower.includes(String(k).toLowerCase()))) {
      out.push({ '$artPiece.artType$': { [Op.eq]: enumVal } });
    }
  }
  return out;
}

router.get('/market/listings', async (ctx) => {
  const page = Math.max(1, parseInt(ctx.query.page, 10) || 1);
  const rawPs = parseInt(ctx.query.pageSize, 10) || 12;
  const pageSize = Math.min(48, Math.max(1, rawPs));
  const q = String(ctx.query.q || '').trim();

  const escapeLike = (s) => String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

  const listingInclude = [
    {
      model: ArtPiece,
      as: 'artPiece',
      attributes: ['id', 'title', 'description', 'filePath', 'artType', 'textContent', 'seriesTitle', 'episodeTitle'],
      required: true,
    },
    {
      model: User,
      as: 'seller',
      attributes: ['id', 'username'],
      required: true,
    },
  ];

  const listingWhere = { status: 'active' };
  if (q) {
    const like = `%${escapeLike(q)}%`;
    const ors = [
      { '$artPiece.title$': { [Op.like]: like } },
      { '$artPiece.description$': { [Op.like]: like } },
      { '$artPiece.textContent$': { [Op.like]: like } },
      { '$artPiece.seriesTitle$': { [Op.like]: like } },
      { '$artPiece.episodeTitle$': { [Op.like]: like } },
      { '$seller.username$': { [Op.like]: like } },
      { '$artPiece.artType$': { [Op.like]: like } },
      ...marketArtTypeOrFromQuery(q),
    ];
    listingWhere[Op.or] = ors;
  }

  /**
   * 无关键词：COUNT 不需 JOIN，避免 MySQL 下 include + distinct count 报错。
   * 有关键词：用 findAndCountAll（distinct + col:id + subQuery:false）生成稳定 SQL。
   */
  const queryListings = async () => {
    if (!q) {
      const [count, rows] = await Promise.all([
        MarketListing.count({ where: { status: 'active' } }),
        MarketListing.findAll({
          where: { status: 'active' },
          include: listingInclude,
          order: [['createdAt', 'DESC']],
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
      ]);
      return { count, rows };
    }
    const result = await MarketListing.findAndCountAll({
      where: listingWhere,
      include: listingInclude,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true,
      col: 'id',
      subQuery: false,
    });
    let count = result.count;
    if (Array.isArray(count)) {
      count = count.reduce((sum, row) => sum + Number(row?.count ?? 0), 0);
    }
    return { count, rows: result.rows };
  };

  try {
    const { count, rows } = await queryListings();
    ctx.body = {
      items: rows,
      total: count,
      page,
      pageSize,
    };
  } catch (e) {
    const code = e?.parent?.code || e?.original?.code;
    if (code === 'ER_NO_SUCH_TABLE') {
      try {
        await MarketListing.sync();
        await MarketCartItem.sync();
        await MarketChatMessage.sync();
        const { count, rows } = await queryListings();
        ctx.body = {
          items: rows,
          total: count,
          page,
          pageSize,
        };
        return;
      } catch (e2) {
        console.error(e2);
      }
    }
    console.error(e);
    ctx.status = 500;
    ctx.body = { msg: 'Failed to load market listings' };
  }
});

router.post('/market/listings', auth, async (ctx) => {
  const { artPieceId, price } = ctx.request.body || {};
  const p = Number(price);
  const apId = Number(artPieceId);
  if (!Number.isFinite(apId) || !Number.isFinite(p) || p <= 0) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid artwork or price' };
    return;
  }
  const artPiece = await ArtPiece.findOne({
    where: { id: apId, userId: ctx.state.user.id, status: 'approved' },
  });
  if (!artPiece) {
    ctx.status = 404;
    ctx.body = { msg: 'Art piece not found, unauthorized, or not approved yet' };
    return;
  }
  const existing = await MarketListing.findOne({ where: { artPieceId: apId, status: 'active' } });
  if (existing) {
    ctx.status = 400;
    ctx.body = { msg: 'This artwork is already listed on the market' };
    return;
  }
  const row = await MarketListing.create({
    artPieceId: apId,
    sellerId: ctx.state.user.id,
    price: p,
    status: 'active',
  });
  const full = await MarketListing.findByPk(row.id, {
    include: [
      {
        model: ArtPiece,
        as: 'artPiece',
        attributes: ['id', 'title', 'description', 'filePath', 'artType', 'textContent', 'seriesTitle', 'episodeTitle'],
      },
      { model: User, as: 'seller', attributes: ['id', 'username'] },
    ],
  });
  ctx.body = full;
});

router.delete('/market/listings/:id', auth, async (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid listing id' };
    return;
  }
  const listing = await MarketListing.findByPk(id);
  if (!listing || listing.sellerId !== ctx.state.user.id) {
    ctx.status = 404;
    ctx.body = { msg: 'Listing not found or unauthorized' };
    return;
  }
  if (listing.status !== 'active') {
    ctx.status = 400;
    ctx.body = { msg: 'Only active listings can be removed' };
    return;
  }
  await MarketCartItem.destroy({ where: { listingId: id } });
  await MarketChatMessage.destroy({ where: { listingId: id } });
  listing.status = 'cancelled';
  await listing.save();
  ctx.body = { ok: true };
});

router.get('/market/cart', auth, async (ctx) => {
  const items = await MarketCartItem.findAll({
    where: { userId: ctx.state.user.id },
    include: [
      {
        model: MarketListing,
        as: 'listing',
        where: { status: 'active' },
        required: true,
        include: [
          { model: ArtPiece, as: 'artPiece', attributes: ['title', 'filePath'] },
          { model: User, as: 'seller', attributes: ['id', 'username'] },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
  });
  ctx.body = items;
});

router.post('/market/cart/:listingId', auth, async (ctx) => {
  const listingId = Number(ctx.params.listingId);
  if (!Number.isFinite(listingId)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid listing id' };
    return;
  }
  const listing = await MarketListing.findByPk(listingId);
  if (!listing || listing.status !== 'active') {
    ctx.status = 404;
    ctx.body = { msg: 'Listing not available' };
    return;
  }
  if (listing.sellerId === ctx.state.user.id) {
    ctx.status = 400;
    ctx.body = { msg: 'Cannot add your own listing to cart' };
    return;
  }
  const [row] = await MarketCartItem.findOrCreate({
    where: { userId: ctx.state.user.id, listingId },
    defaults: { userId: ctx.state.user.id, listingId },
  });
  ctx.body = row;
});

router.delete('/market/cart/:listingId', auth, async (ctx) => {
  const listingId = Number(ctx.params.listingId);
  await MarketCartItem.destroy({ where: { userId: ctx.state.user.id, listingId } });
  ctx.body = { ok: true };
});

async function purchaseListingForUser(listingId, buyerId, transaction) {
  const listing = await MarketListing.findOne({
    where: { id: listingId, status: 'active' },
    transaction,
    lock: true,
  });
  if (!listing) return { ok: false, msg: 'Listing no longer available' };
  if (listing.sellerId === buyerId) return { ok: false, msg: 'Cannot buy your own artwork' };
  listing.status = 'sold';
  listing.buyerId = buyerId;
  await listing.save({ transaction });
  await MarketCartItem.destroy({ where: { listingId }, transaction });
  return { ok: true };
}

router.post('/market/listings/:id/buy', auth, async (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid listing id' };
    return;
  }
  try {
    const result = await db.sequelize.transaction(async (t) =>
      purchaseListingForUser(id, ctx.state.user.id, t)
    );
    if (!result.ok) {
      ctx.status = 400;
      ctx.body = { msg: result.msg };
      return;
    }
    ctx.body = { ok: true };
  } catch (e) {
    ctx.status = 500;
    ctx.body = { msg: 'Purchase failed' };
  }
});

router.post('/market/cart/checkout', auth, async (ctx) => {
  try {
    const cart = await MarketCartItem.findAll({
      where: { userId: ctx.state.user.id },
      attributes: ['listingId'],
    });
    if (!cart.length) {
      ctx.status = 400;
      ctx.body = { msg: 'Cart is empty' };
      return;
    }
    const ids = [...new Set(cart.map((c) => c.listingId))];
    await db.sequelize.transaction(async (t) => {
      for (const listingId of ids) {
        const r = await purchaseListingForUser(listingId, ctx.state.user.id, t);
        if (!r.ok) {
          const err = new Error(r.msg || 'checkout');
          err.code = 'CHECKOUT';
          throw err;
        }
      }
    });
    ctx.body = { ok: true };
  } catch (e) {
    if (e.code === 'CHECKOUT') {
      ctx.status = 400;
      ctx.body = { msg: e.message };
      return;
    }
    ctx.status = 500;
    ctx.body = { msg: 'Checkout failed' };
  }
});

router.get('/market/listings/:id/message-peers', auth, async (ctx) => {
  const listingId = Number(ctx.params.id);
  const listing = await MarketListing.findByPk(listingId);
  if (!listing || listing.sellerId !== ctx.state.user.id) {
    ctx.status = 403;
    ctx.body = { msg: 'Forbidden' };
    return;
  }
  const msgs = await MarketChatMessage.findAll({
    where: { listingId },
    attributes: ['fromUserId', 'toUserId'],
  });
  const peerIds = new Set();
  for (const m of msgs) {
    if (m.fromUserId === listing.sellerId) peerIds.add(m.toUserId);
    else if (m.fromUserId) peerIds.add(m.fromUserId);
  }
  peerIds.delete(listing.sellerId);
  const ids = [...peerIds].filter((x) => Number.isFinite(Number(x)));
  if (!ids.length) {
    ctx.body = [];
    return;
  }
  const users = await User.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'username'],
  });
  ctx.body = users.map((u) => ({ id: u.id, username: u.username }));
});

router.get('/market/listings/:listingId/chat/:peerId/messages', auth, async (ctx) => {
  const listingId = Number(ctx.params.listingId);
  const peerId = Number(ctx.params.peerId);
  const me = ctx.state.user.id;
  if (!Number.isFinite(listingId) || !Number.isFinite(peerId)) {
    ctx.status = 400;
    ctx.body = { msg: 'Invalid ids' };
    return;
  }
  const listing = await MarketListing.findByPk(listingId);
  if (!listing || !assertMarketChatParties(listing, me, peerId)) {
    ctx.status = 403;
    ctx.body = { msg: 'Not allowed to view this conversation' };
    return;
  }
  const limitRaw = Number(ctx.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 40;
  const beforeId = ctx.query.beforeId != null ? Number(ctx.query.beforeId) : null;
  const where = {
    listingId,
    [Op.or]: [
      { fromUserId: me, toUserId: peerId },
      { fromUserId: peerId, toUserId: me },
    ],
  };
  if (Number.isFinite(beforeId)) {
    where.id = { [Op.lt]: beforeId };
  }
  const rows = await MarketChatMessage.findAll({
    where,
    order: [
      ['id', 'DESC'],
    ],
    limit,
  });
  const itemsDesc = rows.map((r) => ({
    id: r.id,
    listingId: r.listingId,
    senderId: r.fromUserId,
    sender: r.fromUsername || 'User',
    clientId: r.clientId || null,
    message: r.message || '',
    createdAt: r.createdAt,
  }));
  const items = itemsDesc.slice().reverse();
  const oldest = items[0];
  ctx.body = {
    items,
    hasMore: itemsDesc.length === limit,
    nextCursor: oldest ? { beforeId: oldest.id } : null,
  };
});
}

app.use(router.routes());
app.use(router.allowedMethods());

async function ensureGalleryColumns() {
  const q = db.sequelize.getQueryInterface();
  const table = 'Galleries';
  const defs = {
    coverMode: "ALTER TABLE `Galleries` ADD COLUMN `coverMode` VARCHAR(24) NOT NULL DEFAULT 'default'",
    showTitle: "ALTER TABLE `Galleries` ADD COLUMN `showTitle` TINYINT(1) NOT NULL DEFAULT 1",
    showDescription: "ALTER TABLE `Galleries` ADD COLUMN `showDescription` TINYINT(1) NOT NULL DEFAULT 1",
    titleColor: "ALTER TABLE `Galleries` ADD COLUMN `titleColor` VARCHAR(24) NOT NULL DEFAULT '#1c1c1c'",
    titleFontFamily: "ALTER TABLE `Galleries` ADD COLUMN `titleFontFamily` VARCHAR(80) NOT NULL DEFAULT 'Playfair Display'",
    descriptionColor: "ALTER TABLE `Galleries` ADD COLUMN `descriptionColor` VARCHAR(24) NOT NULL DEFAULT '#3f3f3f'",
    descriptionFontFamily: "ALTER TABLE `Galleries` ADD COLUMN `descriptionFontFamily` VARCHAR(80) NOT NULL DEFAULT 'Lora'",
    titleFontBold: "ALTER TABLE `Galleries` ADD COLUMN `titleFontBold` TINYINT(1) NOT NULL DEFAULT 1",
    descriptionFontBold: "ALTER TABLE `Galleries` ADD COLUMN `descriptionFontBold` TINYINT(1) NOT NULL DEFAULT 0",
    coverOpacity: "ALTER TABLE `Galleries` ADD COLUMN `coverOpacity` FLOAT NOT NULL DEFAULT 0.92",
    coverBlur: "ALTER TABLE `Galleries` ADD COLUMN `coverBlur` FLOAT NOT NULL DEFAULT 6",
    allowChat: "ALTER TABLE `Galleries` ADD COLUMN `allowChat` TINYINT(1) NOT NULL DEFAULT 1",
    allowPublicAccess: "ALTER TABLE `Galleries` ADD COLUMN `allowPublicAccess` TINYINT(1) NOT NULL DEFAULT 0",
    publicAccessCode: "ALTER TABLE `Galleries` ADD COLUMN `publicAccessCode` VARCHAR(64) NULL",
  };
  const current = await q.describeTable(table);
  for (const [name, sql] of Object.entries(defs)) {
    if (!current[name]) {
      await db.sequelize.query(sql);
    }
  }
  const [indexes] = await db.sequelize.query("SHOW INDEX FROM `Galleries` WHERE Key_name = 'uniq_gallery_public_access_code'");
  if (!indexes || indexes.length === 0) {
    await db.sequelize.query("ALTER TABLE `Galleries` ADD UNIQUE KEY `uniq_gallery_public_access_code` (`publicAccessCode`)");
  }
}

/** 旧库：为作品类型 ENUM 增加 calligraphy，与 ArtPiece 模型一致 */
async function ensureArtPieceArtTypeEnum() {
  try {
    const [rows] = await db.sequelize.query("SHOW COLUMNS FROM `ArtPieces` WHERE Field = 'artType'");
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return;
    const colType = String(row.Type || row.type || '');
    if (colType.includes('calligraphy')) return;
    await db.sequelize.query(
      "ALTER TABLE `ArtPieces` MODIFY COLUMN `artType` ENUM('photography','painting','calligraphy','video','literature','object') NOT NULL DEFAULT 'photography'"
    );
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (msg.includes("doesn't exist") || msg.includes("Unknown table")) return;
    throw e;
  }
}

async function start() {
  assertJwtConfigured();
  ensureDir(path.resolve(__dirname, '..', 'backend', 'uploads', '_tmp'));
  ensureDir(path.resolve(__dirname, '..', 'backend', 'uploads', 'watermarked'));
  ensureDir(path.resolve(__dirname, '..', 'backend', 'uploads', 'avatars'));
  ensureDir(path.resolve(__dirname, '..', 'backend', 'uploads', 'gallery-posters'));
  await db.sequelize.authenticate();
  await ensureGalleryColumns();
  await ensureArtPieceArtTypeEnum();
  await db.sequelize.sync();

  const useHttps = ['1', 'true', 'yes'].includes(String(process.env.USE_HTTPS || '').toLowerCase());
  let server;
  if (useHttps) {
    const keyFile = process.env.SSL_KEY_PATH || path.join(__dirname, 'certs', 'localhost-key.pem');
    const certFile = process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', 'localhost.pem');
    if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
      console.error('USE_HTTPS is set but SSL cert files are missing. Expected:', keyFile, 'and', certFile);
      process.exit(1);
    }
    const key = fs.readFileSync(keyFile);
    const cert = fs.readFileSync(certFile);
    server = https.createServer({ key, cert }, app.callback());
  } else {
    server = http.createServer(app.callback());
  }
  if (shouldMount('realtime')) {
  const socketIoCorsOrigin =
    corsAllowList && corsAllowList.length > 0 ? corsAllowList : '*';
  const io = new Server(server, {
    cors: {
      origin: socketIoCorsOrigin,
      methods: ['GET', 'POST'],
    },
  });
  ioRef = io;

  const cleanupOldMessages = async () => {
    try {
      await db.GalleryChatMessage.destroy({ where: { createdAt: { [Op.lt]: cutoffTwoDays() } } });
    } catch {}
  };
  cleanupOldMessages();
  setInterval(cleanupOldMessages, 60 * 60 * 1000);

  io.on('connection', (socket) => {
    socket.on('join_gallery', async (payload, ack) => {
      const galleryId = Number(payload?.galleryId);
      const userId = Number(payload?.userId);
      const fallbackUsername = payload?.username ? String(payload.username) : 'Anonymous';
      if (!Number.isFinite(galleryId) || !Number.isFinite(userId)) {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      const gallery = await Gallery.findByPk(galleryId, { attributes: ['id', 'allowChat'] });
      if (!gallery || gallery.allowChat === false) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'chat_disabled' });
        return;
      }

      leaveTrackedRoom(socket);

      const dbUser = await User.findByPk(userId, { attributes: ['id', 'username', 'avatarUpdatedAt'] });
      const username = dbUser?.username || fallbackUsername;
      const avatarUpdatedAt = dbUser?.avatarUpdatedAt || null;

      const room = `gallery_${galleryId}`;
      socket.data.room = room;
      socket.data.galleryId = galleryId;
      socket.data.userId = userId;
      socket.data.username = username;

      socket.join(room);

      if (!roomState.has(room)) roomState.set(room, new Map());
      const usersMap = roomState.get(room);
      if (!usersMap.has(userId)) usersMap.set(userId, { userId, username, avatarUpdatedAt, sockets: new Set() });
      const entry = usersMap.get(userId);
      entry.username = username;
      entry.avatarUpdatedAt = avatarUpdatedAt;
      entry.sockets.add(socket.id);

      emitRoomUsers(room);
      if (typeof ack === 'function') ack({ ok: true, room });
    });

    socket.on('leave_gallery', () => {
      leaveTrackedRoom(socket);
    });

    socket.on('send_gallery_message', (data, ack) => {
      const galleryId = Number(data?.galleryId ?? socket.data?.galleryId);
      const room = socket.data?.room || (Number.isFinite(galleryId) ? `gallery_${galleryId}` : null);
      if (!room || !/^gallery_\d+$/.test(room)) {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      if (!socket.rooms.has(room)) socket.join(room);
      const clientId = data?.clientId ? String(data.clientId) : null;
      const msgText = clampChatMessage(data?.message ? String(data.message) : '');
      if (!msgText.trim()) {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      const senderId = socket.data?.userId || data?.senderId;
      const senderName = socket.data?.username || data?.sender || 'Anonymous';
      const msgTime = data?.time;

      db.GalleryChatMessage.create({
        galleryId,
        senderId: Number.isFinite(Number(senderId)) ? Number(senderId) : null,
        senderName,
        clientId,
        message: msgText,
      })
        .then((row) => {
          if (typeof ack === 'function') ack({ ok: true, messageId: row.id, createdAt: row.createdAt });
          ioRef.to(room).emit('receive_gallery_message', {
            room,
            messageId: row.id,
            createdAt: row.createdAt,
            clientId: clientId || undefined,
            message: msgText,
            sender: senderName,
            senderId,
            time: msgTime,
          });
        })
        .catch(() => {
          if (typeof ack === 'function') ack({ ok: false });
        });
    });

    socket.on('join_chat', (room) => {
      if (typeof room !== 'string' || !/^gallery_\d+$/.test(room)) return;
      socket.join(room);
    });

    socket.on('join_market_chat', async (payload, ack) => {
      const listingId = Number(payload?.listingId);
      const userId = Number(payload?.userId);
      const peerId = Number(payload?.peerId);
      if (!Number.isFinite(listingId) || !Number.isFinite(userId) || !Number.isFinite(peerId)) {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      const listing = await MarketListing.findByPk(listingId);
      if (!listing || !assertMarketChatParties(listing, userId, peerId)) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'not_allowed' });
        return;
      }
      leaveMarketRoom(socket);
      const room = marketDmRoom(listingId, userId, peerId);
      if (!room) {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      socket.data.marketRoom = room;
      socket.data.marketListingId = listingId;
      socket.data.marketPeerId = peerId;
      socket.data.userId = userId;
      const dbUser = await User.findByPk(userId, { attributes: ['id', 'username'] });
      socket.data.username = dbUser?.username || payload?.username || 'User';
      socket.join(room);
      if (typeof ack === 'function') ack({ ok: true, room });
    });

    socket.on('leave_market_chat', () => {
      leaveMarketRoom(socket);
    });

    socket.on('send_market_message', (data, ack) => {
      const listingId = Number(data?.listingId ?? socket.data?.marketListingId);
      const peerId = Number(data?.peerId ?? socket.data?.marketPeerId);
      const room =
        socket.data?.marketRoom ||
        (Number.isFinite(listingId) && Number.isFinite(peerId) && Number.isFinite(socket.data?.userId)
          ? marketDmRoom(listingId, socket.data.userId, peerId)
          : null);
      if (!room) {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      if (!socket.rooms.has(room)) socket.join(room);
      const fromId = socket.data?.userId;
      const toId = peerId;
      const msgText = clampChatMessage(data?.message ? String(data.message) : '');
      if (!Number.isFinite(fromId) || !Number.isFinite(toId) || !msgText.trim()) {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      MarketListing.findByPk(listingId)
        .then((listing) => {
          if (!listing || !assertMarketChatParties(listing, fromId, toId)) {
            if (typeof ack === 'function') ack({ ok: false, reason: 'not_allowed' });
            return null;
          }
          const clientId = data?.clientId ? String(data.clientId) : null;
          const senderName = socket.data?.username || data?.sender || 'User';
          return MarketChatMessage.create({
            listingId,
            fromUserId: fromId,
            toUserId: toId,
            fromUsername: senderName,
            clientId,
            message: msgText,
          }).then((row) => ({ row, clientId, senderName, msgText }));
        })
        .then((pack) => {
          if (!pack) return;
          const { row, clientId, senderName, msgText } = pack;
          if (typeof ack === 'function') ack({ ok: true, messageId: row.id, createdAt: row.createdAt });
          ioRef.to(room).emit('receive_market_message', {
            room,
            listingId,
            messageId: row.id,
            createdAt: row.createdAt,
            clientId: clientId || undefined,
            message: msgText,
            sender: senderName,
            senderId: fromId,
            time: data?.time,
          });
        })
        .catch(() => {
          if (typeof ack === 'function') ack({ ok: false });
        });
    });

    socket.on('send_message', (data) => {
      const room = data?.room;
      if (typeof room !== 'string' || !/^gallery_\d+$/.test(room)) return;
      if (!socket.rooms.has(room)) return;
      const safe = {
        ...data,
        room,
        message: clampChatMessage(data?.message != null ? String(data.message) : ''),
      };
      if (!safe.message.trim()) return;
      ioRef.to(room).emit('receive_message', safe);
    });

    socket.on('disconnect', () => {
      leaveTrackedRoom(socket);
      leaveMarketRoom(socket);
    });
  });
  } else {
    ioRef = null;
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 5002;
  const scheme = useHttps ? 'https' : 'http';
  server.listen(port, () => {
    console.log(`Koa server is running on ${scheme}://localhost:${port}`);
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
