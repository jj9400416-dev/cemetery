// Detect the cyan section loops in Agnipa.jpg via color segmentation and
// connected-component labeling, then print their bounding boxes / centroids.
import sharp from 'sharp';

const IMG = 'assets/Agnipa.jpg';
const { data, info } = await sharp(IMG).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
console.log('image', W, H, 'channels', C);

// Cyan test: blue and green high, red low, and green/blue close.
const isCyan = (r, g, b) => b > 150 && g > 120 && r < 120 && b - r > 60 && g - r > 40;

// Downsample factor to speed up and to merge thin lines via dilation-ish grid.
const step = 3;
const gw = Math.ceil(W / step), gh = Math.ceil(H / step);
const mask = new Uint8Array(gw * gh);
for (let gy = 0; gy < gh; gy++) {
  for (let gx = 0; gx < gw; gx++) {
    let hit = 0;
    for (let dy = 0; dy < step && !hit; dy++) {
      for (let dx = 0; dx < step; dx++) {
        const x = gx * step + dx, y = gy * step + dy;
        if (x >= W || y >= H) continue;
        const i = (y * W + x) * C;
        if (isCyan(data[i], data[i + 1], data[i + 2])) { hit = 1; break; }
      }
    }
    mask[gy * gw + gx] = hit;
  }
}

// Count cyan pixels total
let total = 0;
for (let i = 0; i < mask.length; i++) total += mask[i];
console.log('cyan grid cells:', total, '/', mask.length);

// Dilate mask by radius r to connect broken line fragments.
const r = 2;
const dil = new Uint8Array(mask.length);
for (let y = 0; y < gh; y++) {
  for (let x = 0; x < gw; x++) {
    if (!mask[y * gw + x]) continue;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        dil[ny * gw + nx] = 1;
      }
    }
  }
}

// Connected components (4-neighbor) on dilated mask.
const label = new Int32Array(dil.length).fill(-1);
const comps = [];
const stack = [];
for (let s = 0; s < dil.length; s++) {
  if (!dil[s] || label[s] !== -1) continue;
  const id = comps.length;
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1, count = 0, sx = 0, sy = 0;
  label[s] = id; stack.push(s);
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % gw, y = (idx / gw) | 0;
    count++; sx += x; sy += y;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
    const nb = [idx - 1, idx + 1, idx - gw, idx + gw];
    for (const n of nb) {
      if (n < 0 || n >= dil.length) continue;
      // prevent row wrap
      if ((n === idx - 1 && x === 0) || (n === idx + 1 && x === gw - 1)) continue;
      if (dil[n] && label[n] === -1) { label[n] = id; stack.push(n); }
    }
  }
  comps.push({ id, count, minx, miny, maxx, maxy, cx: sx / count, cy: sy / count });
}

comps.sort((a, b) => b.count - a.count);
console.log('\ncomponents (grid units, step=' + step + '): showing top 30');
for (const c of comps.slice(0, 30)) {
  const pxc = (v) => ((v * step) / W * 100).toFixed(1);
  const pyc = (v) => ((v * step) / H * 100).toFixed(1);
  console.log(
    `#${c.id} cells=${c.count} bbox=[${pxc(c.minx)},${pyc(c.miny)} -> ${pxc(c.maxx)},${pyc(c.maxy)}]% centroid=(${pxc(c.cx)},${pyc(c.cy)})%`
  );
}
console.log('\n(total components: ' + comps.length + ')');
