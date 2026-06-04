const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const png2icons = require('png2icons');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const iconsetDir = path.join(buildDir, 'GoodCopy.iconset');
const sourcePng = path.join(buildDir, 'icon-1024.png');
const icnsPath = path.join(buildDir, 'icon.icns');

const SIZE = 1024;
const data = Buffer.alloc(SIZE * SIZE * 4);

const red = [239, 68, 68, 255];
const redDark = [220, 38, 38, 255];
const white = [255, 255, 255, 255];

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type, payload) {
  const typeBuffer = Buffer.from(type);
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length, 0);
  typeBuffer.copy(chunk, 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, payload])), 8 + payload.length);
  return chunk;
}

function writePng(file, width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const gamma = Buffer.alloc(4);
  gamma.writeUInt32BE(45455, 0);
  const srgb = Buffer.from([0]);
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(2835, 0);
  phys.writeUInt32BE(2835, 4);
  phys[8] = 1;

  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', header),
      pngChunk('sRGB', srgb),
      pngChunk('gAMA', gamma),
      pngChunk('pHYs', phys),
      pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      pngChunk('IEND', Buffer.alloc(0))
    ])
  );
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
    255
  ];
}

function blendPixel(x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || alpha <= 0) return;
  const i = (Math.floor(y) * SIZE + Math.floor(x)) * 4;
  const srcA = Math.min(1, Math.max(0, alpha)) * (color[3] / 255);
  const dstA = data[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;

  data[i] = Math.round((color[0] * srcA + data[i] * dstA * (1 - srcA)) / outA);
  data[i + 1] = Math.round((color[1] * srcA + data[i + 1] * dstA * (1 - srcA)) / outA);
  data[i + 2] = Math.round((color[2] * srcA + data[i + 2] * dstA * (1 - srcA)) / outA);
  data[i + 3] = Math.round(outA * 255);
}

function roundedRectSdf(px, py, x, y, w, h, r) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r);
  const qy = Math.abs(py - cy) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function aa(distance) {
  return Math.max(0, Math.min(1, 0.5 - distance));
}

function fillRoundedRect(x, y, w, h, r, colorFn) {
  const minX = Math.max(0, Math.floor(x - 2));
  const maxX = Math.min(SIZE - 1, Math.ceil(x + w + 2));
  const minY = Math.max(0, Math.floor(y - 2));
  const maxY = Math.min(SIZE - 1, Math.ceil(y + h + 2));

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const alpha = aa(roundedRectSdf(px + 0.5, py + 0.5, x, y, w, h, r));
      if (alpha > 0) blendPixel(px, py, colorFn(px, py), alpha);
    }
  }
}

function strokeRoundedRect(x, y, w, h, r, strokeWidth, color) {
  fillRoundedRect(x, y, w, h, r, () => color);
  fillRoundedRect(
    x + strokeWidth,
    y + strokeWidth,
    w - strokeWidth * 2,
    h - strokeWidth * 2,
    Math.max(0, r - strokeWidth),
    (px, py) => {
      const t = Math.min(1, Math.max(0, py / SIZE));
      return mixColor(red, redDark, t * 0.22);
    }
  );
}

fs.rmSync(iconsetDir, { recursive: true, force: true });
fs.mkdirSync(iconsetDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });

fillRoundedRect(72, 72, 880, 880, 210, (_px, py) => {
  const t = Math.min(1, Math.max(0, (py - 72) / 880));
  return mixColor(red, redDark, t * 0.35);
});

strokeRoundedRect(318, 286, 388, 496, 52, 54, white);
fillRoundedRect(398, 218, 228, 120, 42, () => white);
fillRoundedRect(450, 254, 124, 42, 18, (_px, py) => mixColor(red, redDark, py / SIZE * 0.22));

fillRoundedRect(390, 438, 244, 42, 20, () => white);
fillRoundedRect(390, 540, 244, 42, 20, () => white);
fillRoundedRect(390, 642, 178, 42, 20, () => white);

writePng(sourcePng, SIZE, SIZE, data);

const icns = png2icons.createICNS(fs.readFileSync(sourcePng), png2icons.BICUBIC, 0);
if (!icns) {
  throw new Error('Failed to create ICNS from generated PNG');
}

fs.writeFileSync(icnsPath, icns);
console.log(`Generated ${icnsPath}`);
