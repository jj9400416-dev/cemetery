// Accuracy checks for extracted walkway routes.
// For every src/data/routes/*.json:
//   - last waypoint within 1.5% of the grave's x/y (from src/data.js INITIAL_PLACES)
//   - first waypoint at an entrance (from INITIAL_CEMETERY_FEATURES; warn >2.5%)
//   - reports maxDeviation (RDP simplification error recorded at extraction)
// Usage: node scripts/check-routes.js  (exit 1 on failure; pure node, no deps)

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, 'src', 'data', 'routes');
const DATA_JS = path.join(ROOT, 'src', 'data.js');

const LAST_TOL = 1.5;
const FIRST_WARN = 2.5;

const dataSrc = fs.readFileSync(DATA_JS, 'utf8');

function parseEntries(block, fields) {
  const entries = [];
  const re = /\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(block))) {
    const obj = m[1];
    const get = (f) => {
      const r = new RegExp(`${f}:\\s*'([^']*)'`);
      const mm = obj.match(r);
      return mm ? mm[1] : null;
    };
    const e = {};
    for (const f of fields) e[f] = get(f);
    if (e.name || e.id) entries.push(e);
  }
  return entries;
}

const placesBlock = dataSrc.match(/INITIAL_PLACES\s*=\s*\[(.*?)\];/s)?.[1] || '';
const featsBlock = dataSrc.match(/INITIAL_CEMETERY_FEATURES\s*=\s*\[(.*?)\];/s)?.[1] || '';
const places = parseEntries(placesBlock, ['name', 'x', 'y']);
const entrances = parseEntries(featsBlock, ['id', 'x', 'y']).map((e) => ({
  id: e.id,
  x: parseFloat(String(e.x).replace('%', '')),
  y: parseFloat(String(e.y).replace('%', '')),
}));

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const graveByName = new Map(places.map((p) => [norm(p.name), p]));

const files = fs.existsSync(ROUTES_DIR) ? fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.json')) : [];
if (!files.length) {
  console.error('No route files found in src/data/routes/');
  process.exit(1);
}

let failures = 0;
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8'));
  const wps = r.waypoints || [];
  const grave = graveByName.get(norm(r.grave));
  console.log(`\n${f}: grave="${r.grave}" entrance="${r.entrance}" points=${wps.length} maxDeviation=${r.maxDeviation ?? 'n/a'}`);
  if (!grave) {
    console.log('  FAIL: grave not found in INITIAL_PLACES');
    failures++;
    continue;
  }
  const gx = parseFloat(String(grave.x).replace('%', ''));
  const gy = parseFloat(String(grave.y).replace('%', ''));
  const first = wps[0];
  const last = wps[wps.length - 1];
  const dLast = Math.hypot(last.x - gx, last.y - gy);
  const endOk = dLast <= LAST_TOL;
  console.log(`  last=(${last.x},${last.y}) grave=(${gx},${gy}) dist=${dLast.toFixed(2)} ${endOk ? 'OK' : `FAIL (> ${LAST_TOL})`}`);
  if (!endOk) failures++;

  let dFirst = Infinity;
  let nearId = '-';
  for (const e of entrances) {
    const d = Math.hypot(first.x - e.x, first.y - e.y);
    if (d < dFirst) {
      dFirst = d;
      nearId = e.id;
    }
  }
  const firstOk = dFirst <= FIRST_WARN;
  console.log(`  first=(${first.x},${first.y}) nearest=${nearId} dist=${dFirst.toFixed(2)} ${firstOk ? 'OK' : `WARN (> ${FIRST_WARN})`}`);
  if (!firstOk) failures++;
}

console.log(`\n${files.length} route file(s), ${failures} failure(s).`);
process.exit(failures ? 1 : 0);
