// Find enclosed loops (section bands) by flood-filling non-cyan background.
// The blue walkway lines form closed loops; the interior of each loop is a
// region of non-cyan pixels fully surrounded by cyan. Regions reachable from
// the image border are outside; unreached regions are section interiors.
import sharp from 'sharp';

const IMG = 'assets/Agnipa.jpg';
const { data, info } = await sharp(IMG).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;

const isCyan = (r, g, b) => b > 150 && g > 120 && r < 120 && b - r > 60 && g - r > 40;

const N = W * H;
const cyan = new Uint8Array(N);
for (let i = 0, p = 0; i < N; i++, p += C) {
  if (isCyan(data[p], data[p + 1], data[p + 2])) cyan[i] = 1;
}

// Dilate cyan by `rad` to seal small gaps in the outlines.
const rad = 2;
const wall = new Uint8Array(N);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!cyan[y * W + x]) continue;
    for (let dy = -rad; dy <= rad; dy++) {
      const ny = y + dy; if (ny < 0 || ny >= H) continue;
      for (let dx = -rad; dx <= rad; dx++) {
        const nx = x + dx; if (nx < 0 || nx >= W) continue;
        wall[ny * W + nx] = 1;
      }
    }
  }
}

// Flood fill background from the border.
const outside = new Uint8Array(N);
const stack = [];
const push = (i) => { if (!outside[i] && !wall[i]) { outside[i] = 1; stack.push(i); } };
for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
while (stack.length) {
  const i = stack.pop();
  const x = i % W, y = (i / W) | 0;
  if (x > 0) push(i - 1);
  if (x < W - 1) push(i + 1);
  if (y > 0) push(i - W);
  if (y < H - 1) push(i + W);
}

// Enclosed regions = non-wall, non-outside. Label them.
const label = new Int32Array(N).fill(-1);
const comps = [];
for (let s = 0; s < N; s++) {
  if (wall[s] || outside[s] || label[s] !== -1) continue;
  const id = comps.length;
  let count = 0, minx = W, miny = H, maxx = -1, maxy = -1, sx = 0, sy = 0;
  label[s] = id; stack.push(s);
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i / W) | 0;
    count++; sx += x; sy += y;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
    if (x > 0 && !wall[i - 1] && !outside[i - 1] && label[i - 1] === -1) { label[i - 1] = id; stack.push(i - 1); }
    if (x < W - 1 && !wall[i + 1] && !outside[i + 1] && label[i + 1] === -1) { label[i + 1] = id; stack.push(i + 1); }
    if (y > 0 && !wall[i - W] && !outside[i - W] && label[i - W] === -1) { label[i - W] = id; stack.push(i - W); }
    if (y < H - 1 && !wall[i + W] && !outside[i + W] && label[i + W] === -1) { label[i + W] = id; stack.push(i + W); }
  }
  comps.push({ id, count, minx, miny, maxx, maxy, cx: sx / count, cy: sy / count });
}

comps.sort((a, b) => b.count - a.count);
const pct = (v, dim) => ((v / dim) * 100).toFixed(1);
console.log('enclosed regions (area >= 0.05% of image):');
let n = 0;
for (const c of comps) {
  const areaPct = (c.count / N) * 100;
  if (areaPct < 0.05) continue;
  n++;
  console.log(
    `#${c.id} area=${areaPct.toFixed(2)}% bbox=[${pct(c.minx, W)},${pct(c.miny, H)} -> ${pct(c.maxx, W)},${pct(c.maxy, H)}]% centroid=(${pct(c.cx, W)},${pct(c.cy, H)})%`
  );
}
console.log('significant regions:', n, ' / total', comps.length);

// Visualize: color each significant enclosed region; save over a downscaled map.
const palette = [[255,0,0],[0,255,0],[0,128,255],[255,255,0],[255,0,255],[0,255,255],[255,128,0],[128,0,255],[0,200,0],[200,0,100],[100,100,255],[255,255,255]];
const out = Buffer.from(data);
const sigIds = comps.filter((c) => (c.count / N) * 100 >= 0.05).map((c) => c.id);
const colorOf = new Map();
sigIds.forEach((id, i) => colorOf.set(id, palette[i % palette.length]));
for (let i = 0; i < N; i++) {
  const id = label[i];
  if (id !== -1 && colorOf.has(id)) {
    const p = i * C;
    const col = colorOf.get(id);
    out[p] = Math.round(data[p] * 0.4 + col[0] * 0.6);
    out[p + 1] = Math.round(data[p + 1] * 0.4 + col[1] * 0.6);
    out[p + 2] = Math.round(data[p + 2] * 0.4 + col[2] * 0.6);
  }
}
await sharp(out, { raw: { width: W, height: H, channels: C } }).resize(1200).png().toFile('debug/loops-detected.png');
console.log('wrote debug/loops-detected.png');
