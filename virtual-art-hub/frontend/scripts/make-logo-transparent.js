/**
 * 将 VAH logo 近白/浅灰底色转为透明，并缩放到适合网页的尺寸后写入 public/brand/vah-logo.png
 * 用法: node scripts/make-logo-transparent.js <输入png路径>
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DEFAULT_INPUT = path.join(
  process.env.USERPROFILE || '',
  '.cursor',
  'projects',
  'd-cursor-proj-VirtualArtsHub',
  'assets',
  'c__Users_99212_AppData_Roaming_Cursor_User_workspaceStorage_ca70fd0ed5d32d9e57cfe1b949749bc7_images_1483787963-89b30051-a8b4-4899-bc42-6d1ed28d75ea.png'
);

const OUT_DIR = path.join(__dirname, '..', 'public', 'brand');
const OUTPUT = path.join(OUT_DIR, 'vah-logo.png');
const FAVICON_32 = path.join(OUT_DIR, 'favicon-32.png');
const PWA_192 = path.join(OUT_DIR, 'vah-pwa-192.png');
const PWA_512 = path.join(OUT_DIR, 'vah-pwa-512.png');
const TARGET_WIDTH = 360;

/** 浏览器标签：去透明边后完整落在画布内（contain），并略缩小留白避免贴边/溢出感 */
async function tabFaviconFromLogo(srcPath, size, outPath) {
  const inner = Math.max(1, Math.round(size * 0.82));
  await sharp(srcPath)
    .trim()
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      position: 'center',
    })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      position: 'center',
    })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

/** PWA / 主屏幕：完整可见，略留边 */
async function squareIconFromLogo(srcPath, size, outPath) {
  await sharp(srcPath)
    .trim()
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      position: 'center',
    })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

function shouldMakeTransparent(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (r + g + b) / 3;
  const sat = max === 0 ? 0 : (max - min) / max;
  // 近白/浅灰纸感背景（高明度、低饱和）
  if (lightness > 218 && sat < 0.14) return true;
  if (lightness > 235) return true;
  return false;
}

async function main() {
  const input = process.argv[2] || DEFAULT_INPUT;
  if (!fs.existsSync(input)) {
    console.error('Input not found:', input);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) {
    console.error('Expected RGBA');
    process.exit(1);
  }
  const buf = Buffer.from(data);
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    if (shouldMakeTransparent(r, g, b)) {
      buf[i + 3] = 0;
    }
  }

  await sharp(buf, { raw: { width, height, channels: 4 } })
    .resize({ width: TARGET_WIDTH, fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(OUTPUT);

  const meta = await sharp(OUTPUT).metadata();
  console.log('Wrote', OUTPUT, `${meta.width}x${meta.height}`);

  await tabFaviconFromLogo(OUTPUT, 32, FAVICON_32);
  await squareIconFromLogo(OUTPUT, 192, PWA_192);
  await squareIconFromLogo(OUTPUT, 512, PWA_512);
  console.log('Wrote', FAVICON_32, PWA_192, PWA_512);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
