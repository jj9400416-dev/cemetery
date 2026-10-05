// Temporary: render section polygons + labels (exactly as FindGrave does) over Agnipa.jpg
import fs from 'node:fs';
import sharp from 'sharp';

const SECTIONS = [
  ['S1', [[59, 12.6], [58.5, 26.9], [41.7, 49.5], [41.1, 44], [35.1, 35.8], [35.2, 28.1], [51.4, 14.6], [53.1, 11.3]]],
  ['S2', [[75.5, 22.6], [79.7, 27.3], [80, 34], [78.8, 32.9], [78.4, 33.7], [74.1, 33]]],
  ['S3', [[61.8, 12.8], [61.6, 28.9], [49.2, 49.1], [42.8, 53.8], [41.8, 52], [59.6, 28.1], [60.3, 12.9]]],
  ['S4', [[64, 13.7], [74.3, 20.7], [72.8, 31.6], [48, 66.8], [44, 57.5], [62.9, 31.6]]],
  ['S5', [[23.7, 31.3], [31.1, 35.1], [39.7, 45.4], [40.2, 53.2], [17.8, 39.4]]],
  ['S6', [[16.2, 40.4], [41.5, 56.4], [43.6, 63.6], [25, 55.7], [24.4, 53.6], [23.1, 54.6], [11.6, 47.5]]],
  ['S7', [[79.4, 37.6], [52.7, 75], [49.1, 68.4], [59.9, 53.7], [62.2, 53.9], [61.2, 51.9], [72.7, 35]]],
  ['S8', [[82.2, 46.1], [78.6, 51], [81.8, 54.5], [75.2, 60.6], [73.2, 59.3], [74.9, 60.8], [60.3, 79.5], [54.1, 76.3], [69.2, 54.2], [78.8, 44.1]]],
  ['S9', [[17.7, 57.7], [20.6, 54.5], [35.6, 64.9], [37.3, 63.4], [46.6, 68.2], [48.1, 73.4], [52.8, 78.7], [51.2, 80.6]]],
  ['S10', [[24.7, 69.9], [27.5, 66.4], [46.9, 79.6], [47.2, 80.8], [49.3, 81.3], [36.4, 82.6], [32.8, 80.3], [34.6, 77.5]]],
  ['S11', [[57.4, 88], [48.2, 93.2], [37.8, 84.6], [53, 83.3]]],
];

const W = 1400, H = Math.round((1400 * 2114) / 1984);
const px = (v) => (v / 100) * W;
const py = (v) => (v / 100) * H;

const rows = SECTIONS.map(([id, pts]) => {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return `${id} label=(${cx.toFixed(1)}, ${cy.toFixed(1)})`;
});
console.log(rows.join('\n'));
console.log('\norder by label y:', SECTIONS.map(([id, pts]) => [id, pts.reduce((a, p) => a + p[1], 0) / pts.length]).sort((a, b) => a[1] - b[1]).map(([id]) => id).join(' -> '));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
${SECTIONS.map(([id, pts]) => `<polygon points="${pts.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')}" fill="rgba(0,208,255,0.18)" stroke="#00d0ff" stroke-width="3"/>`).join('\n')}
${SECTIONS.map(([id, pts]) => {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return `<g><rect x="${px(cx) - 26}" y="${py(cy) - 12}" width="52" height="24" rx="12" fill="rgba(0,150,200,0.92)" stroke="#fff" stroke-width="2"/><text x="${px(cx)}" y="${py(cy) + 6}" font-size="15" font-weight="700" text-anchor="middle" fill="#fff">${id}</text></g>`;
}).join('\n')}
</svg>`;

fs.mkdirSync('debug', { recursive: true });
await sharp('assets/Agnipa.jpg').resize(W, H).composite([{ input: Buffer.from(svg) }]).png().toFile('debug/tmp-sections.png');
console.log('wrote debug/tmp-sections.png');
