import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

function createPng(width, height, r, g, b) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw image data with filter byte 0 for each line
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // filter byte
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      // Draw a stylish gradient with a border
      const distFromCenter = Math.sqrt(
        Math.pow(x - width / 2, 2) + Math.pow(y - height / 2, 2)
      );
      const radius = width * 0.44;

      if (distFromCenter < radius) {
        // Indigo / purple gradient
        const factor = y / height;
        rawData[pxOffset] = Math.floor(r * (1 - factor * 0.4));
        rawData[pxOffset + 1] = Math.floor(g * (1 - factor * 0.3));
        rawData[pxOffset + 2] = Math.floor(b);
        rawData[pxOffset + 3] = 255;
      } else if (distFromCenter < radius + 6) {
        // Border ring
        rawData[pxOffset] = 129; // slate/indigo highlight
        rawData[pxOffset + 1] = 140;
        rawData[pxOffset + 2] = 248;
        rawData[pxOffset + 3] = 255;
      } else {
        // Transparent outside
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const header = Buffer.alloc(8);
  header.writeUInt32BE(len, 0);
  header.write(type, 4, 4, 'ascii');

  const crcVal = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  const footer = Buffer.alloc(4);
  footer.writeUInt32BE(crcVal >>> 0, 0);

  return Buffer.concat([header, data, footer]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function createIco(pngBuffers) {
  // Standard Windows ICO embedding PNG images
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1: icon
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const dirEntries = [];
  const imageBodies = [];

  for (const { width, height, buffer } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry[0] = width >= 256 ? 0 : width;
    entry[1] = height >= 256 ? 0 : height;
    entry[2] = 0; // color palette count
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset

    dirEntries.push(entry);
    imageBodies.push(buffer);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageBodies]);
}

// Generate
const outDir = path.join(process.cwd(), 'build');
fs.mkdirSync(outDir, { recursive: true });

// 512x512 PNG (REA Studio Indigo/Violet Theme)
const png512 = createPng(512, 512, 99, 102, 241);
fs.writeFileSync(path.join(outDir, 'icon.png'), png512);

// 256x256, 128x128, 64x64, 32x32, 16x16 for ICO
const png256 = createPng(256, 256, 99, 102, 241);
const png128 = createPng(128, 128, 99, 102, 241);
const png64 = createPng(64, 64, 99, 102, 241);
const png32 = createPng(32, 32, 99, 102, 241);
const png16 = createPng(16, 16, 99, 102, 241);

const icoBuf = createIco([
  { width: 256, height: 256, buffer: png256 },
  { width: 128, height: 128, buffer: png128 },
  { width: 64, height: 64, buffer: png64 },
  { width: 32, height: 32, buffer: png32 },
  { width: 16, height: 16, buffer: png16 },
]);
fs.writeFileSync(path.join(outDir, 'icon.ico'), icoBuf);

// Icons subfolder for Linux
const iconsDir = path.join(outDir, 'icons');
fs.mkdirSync(iconsDir, { recursive: true });
fs.writeFileSync(path.join(iconsDir, '512x512.png'), png512);
fs.writeFileSync(path.join(iconsDir, '256x256.png'), png256);
fs.writeFileSync(path.join(iconsDir, '128x128.png'), png128);
fs.writeFileSync(path.join(iconsDir, '64x64.png'), png64);
fs.writeFileSync(path.join(iconsDir, '32x32.png'), png32);
fs.writeFileSync(path.join(iconsDir, '16x16.png'), png16);

console.log('Successfully generated app icons in build/');
