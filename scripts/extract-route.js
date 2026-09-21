// Extract a walking-route polyline from a reference PNG (map + drawn route line)
// onto the canonical base map grid.
//
// Usage:
//   node scripts/extract-route.js \
//     --base "assets/agnipa map.jpg" \
//     --ref "assets/Juan Delacruz.png" \
//     --grave "Juan Dela Cruz" \
//     --entrance entranceMain --entrance-x 32 --entrance-y 86 \
//     --out src/data/routes/juan-dela-cruz.json \
//     --debug debug/route-juan-dela-cruz.png
//
// Requires: sharp (devDependency). No app dependencies.
// Steps: register ref->base (grayscale MAD, blue pixels excluded) ->
//        warp -> blue+diff mask -> largest component -> Zhang-Suen thin ->
//        order entrance->grave -> RDP simplify -> percent-of-base JSON + debug overlay.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) => {
    if (!a.startsWith('--')) return [];
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const val = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true';
    return [[key, val]];
  })
);

const BASE = args.base;
const REF = args.ref;
if (!BASE || !REF) {
  console.error('Missing --base or --ref');
  process.exit(1);
}
const GRAVE = args.grave || 'unknown';
const ENTRANCE = args.entrance || 'entranceMain';
const ENTRANCE_X = parseFloat(args.entranceX ?? '32');
const ENTRANCE_Y = parseFloat(args.entranceY ?? '86');
const OUT = args.out || `src/data/routes/${slug(GRAVE)}.json`;
const DEBUG = args.debug || `debug/route-${slug(GRAVE)}.png`;
const EPSILON = parseFloat(args.epsilon ?? '0.9'); // RDP epsilon in percent units
const DIFF_T = parseFloat(args.diffT ?? '25');

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isBlue(r, g, b) {
  return b > 120 && b - r > 60 && b - g > 15;
}

async function loadRaw(p, w, h) {
  let img = sharp(p).removeAlpha();
  if (w && h) img = img.resize(w, h, { fit: 'fill' });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function toGray(raw) {
  const { data, w, h } = raw;
  const g = new Float32Array(w * h);
  const blue = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 3, p++) {
    const r = data[i], gg = data[i + 1], b = data[i + 2];
    g[p] = r * 0.299 + gg * 0.587 + b * 0.114;
    blue[p] = isBlue(r, gg, b) ? 1 : 0;
  }
  return { g, blue, w, h };
}

// MAD of base vs refThumb mapped with scale s + offset (dx,dy in base-thumb px).
function madAt(B, R, s, dx, dy) {
  let sum = 0, n = 0;
  for (let y = 0; y < B.h; y++) {
    for (let x = 0; x < B.w; x++) {
      const rx = Math.round((x - dx) / s);
      const ry = Math.round((y - dy) / s);
      if (rx < 0 || ry < 0 || rx >= R.w || ry >= R.h) continue;
      const rp = ry * R.w + rx;
      if (R.blue[rp]) continue; // drawn line / blue graves in ref
      const bp = y * B.w + x;
      if (B.blue[bp]) continue; // blue-ish graves in base
      sum += Math.abs(B.g[bp] - R.g[rp]);
      n++;
    }
  }
  return n > 100 ? sum / n : Infinity;
}

async function register(basePath, refPath) {
  const bMeta = await sharp(basePath).metadata();
  const rMeta = await sharp(refPath).metadata();
  // Common pixel scale: u thumb-px per native px (square pixels, native aspect kept).
  const u = 256 / bMeta.width;
  const bTW = 256, bTH = Math.round(bMeta.height * u);
  const rTW = Math.round(rMeta.width * u), rTH = Math.round(rMeta.height * u);
  const B = toGray(await loadRaw(basePath, bTW, bTH));
  const Rr = toGray(await loadRaw(refPath, rTW, rTH));
  let best = { mad: Infinity, s: 1, dx: 0, dy: 0 };
  // Stage 1 coarse
  for (let s = 0.94; s <= 1.0601; s += 0.03) {
    for (let dx = -16; dx <= 16; dx += 4) {
      for (let dy = -16; dy <= 16; dy += 4) {
        const m = madAt(B, Rr, s, dx, dy);
        if (m < best.mad) best = { mad: m, s, dx, dy };
      }
    }
  }
  // Stage 2 refine
  const b2 = { ...best };
  for (let s = b2.s - 0.03; s <= b2.s + 0.0301; s += 0.01) {
    for (let dx = b2.dx - 4; dx <= b2.dx + 4; dx += 1) {
      for (let dy = b2.dy - 4; dy <= b2.dy + 4; dy += 1) {
        const m = madAt(B, Rr, s, dx, dy);
        if (m < best.mad) best = { mad: m, s, dx, dy };
      }
    }
  }
  // Full-res warp uses the same common scale u: base-native -> base-thumb (x*u),
  // then residual (s,dx,dy) in thumb px -> ref-thumb, then /u -> ref-native.
  return { ...best, u, baseW: bMeta.width, baseH: bMeta.height, refW: rMeta.width, refH: rMeta.height };
}

// Bilinear sample of RGB ref-native at fractional coords.
function sampleBilinear(data, w, h, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const px = (xx, yy) => {
    xx = Math.min(w - 1, Math.max(0, xx));
    yy = Math.min(h - 1, Math.max(0, yy));
    const i = (yy * w + xx) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const a = px(x0, y0), b = px(x0 + 1, y0), c = px(x0, y0 + 1), d = px(x0 + 1, y0 + 1);
  return [0, 1, 2].map((k) => a[k] * (1 - fx) * (1 - fy) + b[k] * fx * (1 - fy) + c[k] * (1 - fx) * fy + d[k] * fx * fy);
}

function largestComponent(mask, w, h) {
  const seen = new Int32Array(w * h).fill(-1);
  let bestId = -1, bestSize = 0;
  let compId = 0;
  const sizes = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i] !== -1) continue;
    let size = 0;
    const stack = [i];
    seen[i] = compId;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (mask[np] && seen[np] === -1) {
            seen[np] = compId;
            stack.push(np);
          }
        }
      }
    }
    sizes.push(size);
    if (size > bestSize) {
      bestSize = size;
      bestId = compId;
    }
    compId++;
  }
  const out = new Uint8Array(w * h);
  if (bestId >= 0) {
    for (let i = 0; i < w * h; i++) if (seen[i] === bestId) out[i] = 1;
  }
  return { mask: out, size: bestSize, components: compId, sizes: sizes.sort((a, b) => b - a).slice(0, 5) };
}

// Zhang-Suen thinning. Returns 1px skeleton mask.
function thin(mask, w, h) {
  const sk = Uint8Array.from(mask);
  const nbr = (p) => {
    const x = p % w, y = (p / w) | 0;
    const at = (dx, dy) => {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return 0;
      return sk[ny * w + nx] ? 1 : 0;
    };
    // p2..p9 clockwise from north
    return [at(0, -1), at(1, -1), at(1, 0), at(1, 1), at(0, 1), at(-1, 1), at(-1, 0), at(-1, -1)];
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const remove = [];
      for (let p = 0; p < w * h; p++) {
        if (!sk[p]) continue;
        const n = nbr(p);
        const nz = n.reduce((a, b) => a + b, 0);
        if (nz < 2 || nz > 6) continue;
        let transitions = 0;
        for (let k = 0; k < 8; k++) if (n[k] === 0 && n[(k + 1) % 8] === 1) transitions++;
        if (transitions !== 1) continue;
        // p2,p4,p6 / p2,p4,p8, p4=p_north? mapping: n[0]=N,n[2]=E,n[4]=S,n[6]=W
        if (step === 0) {
          if (!(n[0] === 0 || n[2] === 0 || n[4] === 0)) continue;
          if (!(n[2] === 0 || n[4] === 0 || n[6] === 0)) continue;
        } else {
          if (!(n[0] === 0 || n[2] === 0 || n[6] === 0)) continue;
          if (!(n[0] === 0 || n[4] === 0 || n[6] === 0)) continue;
        }
        remove.push(p);
      }
      if (remove.length) {
        changed = true;
        for (const p of remove) sk[p] = 0;
      }
    }
  }
  return sk;
}

// Order skeleton pixels from start (nearest entrance) via greedy walk.
function orderSkeleton(sk, w, h, startX, startY) {
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (sk[y * w + x]) pts.push([x, y]);
  if (!pts.length) return [];
  // endpoints: skeleton pixels with exactly 1 neighbor
  const key = (x, y) => y * w + x;
  const has = new Set(pts.map(([x, y]) => key(x, y)));
  const neighbors = (x, y) => {
    const out = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (has.has(key(x + dx, y + dy))) out.push([x + dx, y + dy]);
      }
    return out;
  };
  const ends = pts.filter(([x, y]) => neighbors(x, y).length === 1);
  const distE = ([x, y]) => Math.hypot((x / w) * 100 - startX, (y / h) * 100 - startY);
  let start;
  if (ends.length) {
    start = ends.sort((a, b) => distE(a) - distE(b))[0];
  } else {
    start = pts.sort((a, b) => distE(a) - distE(b))[0];
  }
  const visited = new Set([key(...start)]);
  const ordered = [start];
  let cur = start;
  while (true) {
    const nbs = neighbors(...cur).filter(([x, y]) => !visited.has(key(x, y)));
    if (!nbs.length) break;
    // prefer straightest: continue in same direction
    const prev = ordered.length > 1 ? ordered[ordered.length - 2] : null;
    nbs.sort(([ax, ay], [bx, by]) => {
      if (!prev) return 0;
      const dx = cur[0] - prev[0], dy = cur[1] - prev[1];
      const sa = (ax - cur[0]) * dx + (ay - cur[1]) * dy;
      const sb = (bx - cur[0]) * dx + (by - cur[1]) * dy;
      return sb - sa;
    });
    cur = nbs[0];
    visited.add(key(...cur));
    ordered.push(cur);
  }
  return ordered;
}

function rdp(points, eps) {
  if (points.length < 3) return { points, maxDiscarded: 0 };
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  let maxDiscarded = 0;
  const distToSeg = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (!len2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.min(1, Math.max(0, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  while (stack.length) {
    const [s, e] = stack.pop();
    let dmax = -1, imax = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSeg(points[i], points[s], points[e]);
      if (d > dmax) {
        dmax = d;
        imax = i;
      }
    }
    if (dmax > eps) {
      keep[imax] = true;
      stack.push([s, imax], [imax, e]);
    } else if (dmax > maxDiscarded) {
      maxDiscarded = dmax;
    }
  }
  return { points: points.filter((_, i) => keep[i]), maxDiscarded };
}

const reg = await register(BASE, REF);
console.log('registration (ref -> base):', JSON.stringify({ mad: +reg.mad.toFixed(2), s: +reg.s.toFixed(3), dx: reg.dx, dy: reg.dy, baseW: reg.baseW, baseH: reg.baseH, refW: reg.refW, refH: reg.refH }));
if (reg.mad > 20) {
  console.error(`Refusing: registration MAD ${reg.mad.toFixed(1)} too high (images may not match).`);
  process.exit(2);
}

// Full-res warp: base-native (x,y) -> base-thumb (x*u, y*u) -> residual
// (s,dx,dy) in thumb px -> ref-thumb -> /u -> ref-native coords.
const baseRaw = await loadRaw(BASE);
const refRaw = await loadRaw(REF);
const bw = baseRaw.w, bh = baseRaw.h;
const rw = refRaw.w, rh = refRaw.h;
const u = reg.u;

const mask = new Uint8Array(bw * bh);
let blueN = 0, diffN = 0, bothN = 0;
for (let y = 0; y < bh; y++) {
  for (let x = 0; x < bw; x++) {
    const rnx = ((x * u - reg.dx) / reg.s) / u, rny = ((y * u - reg.dy) / reg.s) / u;
    if (rnx < 0 || rny < 0 || rnx >= rw - 1 || rny >= rh - 1) continue;
    const [r, g, b] = sampleBilinear(refRaw.data, rw, rh, rnx, rny);
    const bi = (y * bw + x) * 3;
    const br = baseRaw.data[bi], bg = baseRaw.data[bi + 1], bb = baseRaw.data[bi + 2];
    const blue = isBlue(r, g, b);
    const diff = (Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb)) / 3;
    if (blue) blueN++;
    if (diff > DIFF_T) diffN++;
    if (blue && diff > DIFF_T) {
      mask[y * bw + x] = 1;
      bothN++;
    }
  }
}
console.log(`mask stats: blue=${blueN} diff=${diffN} route=${bothN}`);

// Downsample mask for thinning (full-res thinning is slow in JS).
const DW = 640;
const DH = Math.round((DW * bh) / bw);
const small = new Uint8Array(DW * DH);
for (let y = 0; y < DH; y++) {
  for (let x = 0; x < DW; x++) {
    const x0 = Math.floor((x * bw) / DW), x1 = Math.floor(((x + 1) * bw) / DW);
    const y0 = Math.floor((y * bh) / DH), y1 = Math.floor(((y + 1) * bh) / DH);
    let hit = 0;
    for (let yy = y0; yy < Math.min(y1 + 1, bh) && !hit; yy++)
      for (let xx = x0; xx < Math.min(x1 + 1, bw); xx++) if (mask[yy * bw + xx]) { hit = 1; break; }
    small[y * DW + x] = hit;
  }
}
const { mask: kept, size, components, sizes } = largestComponent(small, DW, DH);
console.log(`components=${components} largest=${size} topSizes=${sizes.join(',')}`);
if (!size) {
  console.error('No route pixels found. Try --diffT lower or check line color.');
  process.exit(3);
}
const sk = thin(kept, DW, DH);
const ordered = orderSkeleton(sk, DW, DH, ENTRANCE_X, ENTRANCE_Y);
console.log(`skeleton points=${ordered.length}`);
if (ordered.length < 2) {
  console.error('Skeleton too short.');
  process.exit(4);
}
const pct = ordered.map(([x, y]) => [(x / DW) * 100, (y / DH) * 100]);
const { points: simple, maxDiscarded } = rdp(pct, EPSILON);
console.log(`waypoints: ${simple.length} (from ${pct.length}, eps=${EPSILON})`);

const waypoints = simple.map(([x, y]) => ({ x: +x.toFixed(2), y: +y.toFixed(2) }));
const json = { grave: GRAVE, entrance: ENTRANCE, base: path.basename(BASE), epsilon: EPSILON, maxDeviation: +maxDiscarded.toFixed(3), waypoints };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(json, null, 2) + '\n');
console.log(`wrote ${OUT}`);

// Debug overlay: base downscaled + route mask (red) + waypoints (lime dots).
const DBG_W = 960;
const overlay = await sharp(BASE).resize(DBG_W).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { data: od, info: oi } = overlay;
const sx = oi.width / bw, sy = oi.height / bh;
for (let y = 0; y < bh; y += 2) {
  for (let x = 0; x < bw; x += 2) {
    if (!mask[y * bw + x]) continue;
    const ox = Math.min(oi.width - 1, Math.round(x * sx));
    const oy = Math.min(oi.height - 1, Math.round(y * sy));
    const i = (oy * oi.width + ox) * 3;
    od[i] = 255; od[i + 1] = 0; od[i + 2] = 0;
  }
}
// waypoint dots (lime, 5px)
for (const wp of waypoints) {
  const cx = Math.round((wp.x / 100) * oi.width), cy = Math.round((wp.y / 100) * oi.height);
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy > 9) continue;
      const ox = cx + dx, oy = cy + dy;
      if (ox < 0 || oy < 0 || ox >= oi.width || oy >= oi.height) continue;
      const i = (oy * oi.width + ox) * 3;
      od[i] = 50; od[i + 1] = 255; od[i + 2] = 50;
    }
}
fs.mkdirSync(path.dirname(DEBUG), { recursive: true });
await sharp(Buffer.from(od), { raw: { width: oi.width, height: oi.height, channels: 3 } }).png().toFile(DEBUG);
console.log(`wrote ${DEBUG}`);
