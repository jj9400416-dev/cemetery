// Walkway routing built from extracted reference routes (src/data/routes/*.json).
// - Exact reference route is drawn when the grave has its own file.
// - Otherwise an A* path is computed over the merged walkway graph, with the
//   grave snapped to the nearest edge plus a short final connector.
// Coordinates are percent-of-base-map (0-100), matching the SVG overlay grid.

import createGraph from 'ngraph.graph';
import { aStar } from 'ngraph.path';

const routeModules = import.meta.glob('./data/routes/*.json', { eager: true });
// Canonical per-grave files (`*.route.json`, extracted from the reference PNG
// at the base image size) win over older extractions with the same grave name.
const routeEntries = Object.entries(routeModules).sort(
  ([a], [b]) => (b.endsWith('.route.json') ? 1 : 0) - (a.endsWith('.route.json') ? 1 : 0)
);
export const ROUTES = routeEntries.map(([, m]) => m.default || m);

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Merge all route waypoints into one graph. Nodes within MERGE_TOL (% units)
// of each other are merged so overlapping walkways share vertices.
const MERGE_TOL = 1;

function buildWalkwayGraph(routes) {
  const graph = createGraph();
  const nodes = []; // [{id, x, y}]
  const edges = []; // [{a, b}]
  const findNode = (x, y) => {
    let best = -1;
    let bestD = MERGE_TOL;
    for (const n of nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  };
  const addPoint = (x, y) => {
    const existing = findNode(x, y);
    if (existing !== -1) return existing;
    const id = nodes.length;
    nodes.push({ id, x, y });
    graph.addNode(id, { x, y });
    return id;
  };
  for (const r of routes) {
    const wps = (r.waypoints || []).map((w) => ({ x: +w.x, y: +w.y }));
    for (let i = 0; i < wps.length - 1; i++) {
      const a = addPoint(wps[i].x, wps[i].y);
      const b = addPoint(wps[i + 1].x, wps[i + 1].y);
      if (a === b) continue;
      const w = Math.hypot(wps[i + 1].x - wps[i].x, wps[i + 1].y - wps[i].y);
      graph.addLink(a, b, { w });
      graph.addLink(b, a, { w });
      edges.push({ a, b });
    }
  }
  return { graph, nodes, edges };
}

let cache = null;
function getGraph() {
  if (!cache) cache = buildWalkwayGraph(ROUTES);
  return cache;
}

// Count connected components (dev-only warning helper).
export function countComponents() {
  const { graph, nodes } = getGraph();
  const seen = new Set();
  let count = 0;
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    count++;
    const stack = [n.id];
    seen.add(n.id);
    while (stack.length) {
      const id = stack.pop();
      graph.forEachLinkedNode(id, (linked) => {
        if (!seen.has(linked.id)) {
          seen.add(linked.id);
          stack.push(linked.id);
        }
      });
    }
  }
  return count;
}

if (import.meta.env?.DEV) {
  const n = countComponents();
  if (n > 1) console.warn(`[routing] walkway graph has ${n} disconnected components; add more reference routes to connect them.`);
}

function nearestNode(pt) {
  const { nodes } = getGraph();
  let best = null;
  let bestD = Infinity;
  for (const n of nodes) {
    const d = dist(n, pt);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

// Project point p onto segment ab. Returns {x, y, d}.
function projectOntoSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.min(1, Math.max(0, t));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return { x, y, d: Math.hypot(p.x - x, p.y - y) };
}

function shortestPath(fromId, toId) {
  const { graph } = getGraph();
  if (fromId === toId) {
    const n = graph.getNode(fromId);
    return n ? [{ x: n.data.x, y: n.data.y }] : [];
  }
  const finder = aStar(graph, {
    distance(a, b, link) {
      return link.data.w;
    },
    heuristic(a, b) {
      return Math.hypot(a.data.x - b.data.x, a.data.y - b.data.y);
    },
  });
  const found = finder.find(fromId, toId);
  if (!found || !found.length) return null;
  return found
    .slice()
    .reverse()
    .map((n) => ({ x: n.data.x, y: n.data.y }));
}

// Returns {points: [{x,y}], exact: bool} or null when no route data exists.
export function getRoute(graveName, gravePt, entrancePt) {  if (!gravePt || !entrancePt) return null;
  const { nodes, edges } = getGraph();
  if (!nodes.length) return null;

  const exact = ROUTES.find((r) => normalize(r.grave) === normalize(graveName));
  if (exact?.waypoints?.length) {
    return { points: exact.waypoints.map((w) => ({ x: +w.x, y: +w.y })), exact: true };
  }

  const start = nearestNode(entrancePt);
  if (!start) return null;

  // Snap the grave to the nearest point on the nearest walkway edge.
  let snap = null;
  for (const e of edges) {
    const a = nodes[e.a];
    const b = nodes[e.b];
    const proj = projectOntoSegment(gravePt, a, b);
    if (!snap || proj.d < snap.d) snap = { ...proj, a: e.a, b: e.b };
  }
  if (!snap) return null;

  // Route via the nearer of the edge's two endpoints (shorter total walk).
  const viaA = shortestPath(start.id, snap.a);
  const viaB = shortestPath(start.id, snap.b);
  const len = (pts) => (!pts ? Infinity : pts.reduce((s, p, i) => (i ? s + dist(p, pts[i - 1]) : 0), 0));
  let best = null;
  let bestLen = Infinity;
  for (const [pts, endId] of [[viaA, snap.a], [viaB, snap.b]]) {
    if (!pts) continue;
    const total = len(pts) + Math.hypot(nodes[endId].x - snap.x, nodes[endId].y - snap.y);
    if (total < bestLen) {
      bestLen = total;
      best = pts;
    }
  }
  if (!best) return null;
  return { points: [...best, { x: snap.x, y: snap.y }, { x: gravePt.x, y: gravePt.y }], exact: false };
}

// Runtime routes saved from the app (custom_routes table). They take
// precedence over bundled extractions; the walkway graph rebuilds lazily.
export function addCustomRoutes(routes) {
  let changed = false;
  for (const r of routes || []) {
    if (!r?.grave || !((r.waypoints || []).length > 1)) continue;
    const key = normalize(r.grave);
    const entry = {
      grave: r.grave,
      entrance: r.entrance || 'entranceMain',
      waypoints: r.waypoints.map((w) => ({ x: +w.x, y: +w.y })),
    };
    const i = ROUTES.findIndex((x) => normalize(x.grave) === key);
    if (i >= 0) ROUTES[i] = entry;
    else ROUTES.unshift(entry);
    changed = true;
  }
  if (changed) cache = null;
  return changed;
}
