import sharp from 'sharp';
import fs from 'node:fs';

fs.mkdirSync('debug', { recursive: true });
const src = 'assets/Agnipa.jpg';
const meta = await sharp(src).metadata();
console.log('size', meta.width, meta.height);
const W = meta.width, H = meta.height;
const half = { w: Math.floor(W / 2), h: Math.floor(H / 2) };
const tiles = {
  tl: { left: 0, top: 0, width: half.w, height: half.h },
  tr: { left: half.w, top: 0, width: W - half.w, height: half.h },
  bl: { left: 0, top: half.h, width: half.w, height: H - half.h },
  br: { left: half.w, top: half.h, width: W - half.w, height: H - half.h },
};
for (const [k, region] of Object.entries(tiles)) {
  await sharp(src).extract(region).resize(1100).png().toFile(`debug/q-${k}.png`);
  console.log('wrote debug/q-' + k + '.png');
}
