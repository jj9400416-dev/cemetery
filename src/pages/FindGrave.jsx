import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useGraves } from '../graves.jsx';
import { useToast, EmptyState } from '../ui.jsx';
import { mapImage, photoForName, INITIAL_CEMETERY_FEATURES, INITIAL_MAP_SECTIONS, REFERENCE_ROUTE } from '../data.js';

const parsePercent = (v) => parseFloat(String(v).replace('%', '')) || 0;

function buildRoute(origin, target) {
  if (!origin || !target?.x || !target?.y) return [];
  const startX = parsePercent(origin.x);
  const startY = parsePercent(origin.y);
  const endX = parsePercent(target.x);
  const endY = parsePercent(target.y);
  // Follow the Juan Delacruz.png reference backbone (entrance → central junction),
  // then branch to the grave. Find the backbone vertex nearest the target.
  let nearest = 0;
  let best = Infinity;
  REFERENCE_ROUTE.forEach(([bx, by], i) => {
    const d = Math.hypot(bx - endX, by - endY);
    if (d < best) { best = d; nearest = i; }
  });
  const points = [
    { x: startX, y: startY },
    ...REFERENCE_ROUTE.slice(0, nearest + 1).map(([x, y]) => ({ x, y })),
    { x: endX, y: endY },
  ];
  // Drop near-duplicate consecutive points (<1% apart)
  const clean = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = clean[clean.length - 1];
    if (Math.hypot(points[i].x - prev.x, points[i].y - prev.y) >= 1) clean.push(points[i]);
  }
  const segs = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const p = clean[i];
    const n = clean[i + 1];
    const length = Math.hypot(n.x - p.x, n.y - p.y);
    if (length < 1) continue;
    const angle = (Math.atan2(n.y - p.y, n.x - p.x) * 180) / Math.PI;
    segs.push({ left: `${p.x}%`, top: `${p.y}%`, width: `${length}%`, angle });
  }
  return segs;
}

export default function FindGrave() {
  const { places, loading, dbError, databaseConnected } = useGraves();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [searchText, setSearchText] = useState(params.get('name') || '');
  const [activeId, setActiveId] = useState(null);
  const [routeId, setRouteId] = useState(null);
  const [sectionFilter, setSectionFilter] = useState(params.get('section') || 'All');
  const [mapZoom, setMapZoom] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [mapLocked, setMapLocked] = useState(false);
  const dragRef = useRef({ dragging: false, sx: 0, sy: 0, ox: 0, oy: 0 });

  // Sync URL params (from Home search / section cards / grave detail)
  useEffect(() => {
    const name = params.get('name');
    const section = params.get('section');
    if (name) setSearchText(name);
    if (section) setSectionFilter(section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sections = useMemo(
    () => ['All', ...new Set(places.map((p) => p.section).filter(Boolean))],
    [places]
  );

  const filteredPlaces = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return places.filter((p) => {
      const matchName = !q || p.name.toLowerCase().includes(q);
      const matchSection = sectionFilter === 'All' || p.section === sectionFilter;
      return matchName && matchSection;
    });
  }, [searchText, places, sectionFilter]);

  const activePlace = places.find((p) => String(p.id) === String(activeId)) || filteredPlaces[0] || null;
  const routeTarget = places.find((p) => String(p.id) === String(routeId)) || null;
  const routeAnchor = routeTarget || activePlace;

  const highlightedIds = useMemo(() => new Set(filteredPlaces.map((p) => p.id)), [filteredPlaces]);
  const activeSectionId = activePlace?.section || null;
  const routeOrigin = INITIAL_CEMETERY_FEATURES.find((f) => f.id === 'entranceMain');
  const routeSegments = useMemo(() => buildRoute(routeOrigin, routeAnchor), [routeOrigin, routeAnchor]);

  const searchActive = searchText.trim() !== '' || sectionFilter !== 'All';

  const selectPlace = (p) => {
    setActiveId(p.id);
    setRouteId(p.id);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('name');
      next.delete('section');
      return next;
    }, { replace: true });
  };

  const clearAll = () => {
    setSearchText('');
    setActiveId(null);
    setRouteId(null);
    setSectionFilter('All');
    setParams({}, { replace: true });
  };

  const onMouseDown = (e) => {
    if (mapLocked) return;
    dragRef.current = { dragging: true, sx: e.clientX, sy: e.clientY, ox: mapOffset.x, oy: mapOffset.y };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current.dragging || mapLocked) return;
    setMapOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.sx),
      y: dragRef.current.oy + (e.clientY - dragRef.current.sy),
    });
  };
  const onMouseUp = () => {
    dragRef.current.dragging = false;
  };

  return (
    <div className="container" style={{ paddingTop: 28, paddingBottom: 56 }}>
      <div className="section-head">
        <div className="kicker">Cemetery Map</div>
        <h2>Find a Grave</h2>
        <p>
          <span className={`status-dot ${databaseConnected ? 'on' : 'off'}`} />
          {databaseConnected ? 'Live records from the park database' : 'Showing local records'} · drag to pan, use + / − to zoom.
        </p>
      </div>

      {loading && <div className="skeleton" style={{ height: 640, marginBottom: 18 }} />}
      {dbError && <p className="error-text">Database: {dbError}</p>}

      {!loading && (
        <div className="finder">
          <div className="map-card">
            <div className="map-toolbar">
              <input
                className="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search grave name…"
                aria-label="Search grave name"
              />
              <select
                className="search"
                style={{ flex: '0 1 150px' }}
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                aria-label="Filter by section"
              >
                {sections.map((s) => (
                  <option key={s} value={s}>{s === 'All' ? 'All sections' : `Section ${s}`}</option>
                ))}
              </select>
              <button onClick={() => setMapZoom((z) => Math.min(2.6, +(z + 0.2).toFixed(2)))} title="Zoom in">+</button>
              <button onClick={() => setMapZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))} title="Zoom out">−</button>
              <button onClick={() => { setMapZoom(1); setMapOffset({ x: 0, y: 0 }); }} title="Reset view" style={{ fontSize: 12 }}>Reset</button>
              <button onClick={() => setMapLocked((v) => !v)} title="Lock / unlock panning" style={{ fontSize: 12 }}>
                {mapLocked ? 'Unlock' : 'Lock'}
              </button>
            </div>
            <div
              className="map-viewport"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              <div
                className="map-inner"
                style={{ transform: `scale(${mapZoom}) translate(${mapOffset.x / mapZoom}px, ${mapOffset.y / mapZoom}px)` }}
              >
                <img className="base" src={mapImage} alt="Agnipa cemetery map" draggable={false} />
                <svg className="section-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {INITIAL_MAP_SECTIONS.map((s) => {
                    if (!s.points) return null;
                    const isSelected = sectionFilter !== 'All' && sectionFilter === s.id;
                    const isActive = s.id === activeSectionId;
                    const isDimmed = sectionFilter !== 'All' && !isSelected;
                    return (
                      <polygon
                        key={s.id}
                        points={s.points.map((p) => p.join(',')).join(' ')}
                        className={`section-poly${isActive || isSelected ? ' active' : ''}${isDimmed ? ' dimmed' : ''}`}
                      />
                    );
                  })}
                </svg>
                {INITIAL_MAP_SECTIONS.map((s) => {
                  if (s.points) {
                    const xs = s.points.map((p) => p[0]);
                    const ys = s.points.map((p) => p[1]);
                    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
                    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
                    const isDimmed = sectionFilter !== 'All' && sectionFilter !== s.id;
                    return (
                      <div key={s.id} className={`section-label${isDimmed ? ' dimmed' : ''}`} style={{ left: `${cx}%`, top: `${cy}%` }}>
                        {s.label}
                      </div>
                    );
                  }
                  return (
                    <div key={s.id} className="section-box" style={{ left: s.x, top: s.y, width: s.width, height: s.height }}>
                      {s.label}
                    </div>
                  );
                })}
                {routeSegments.map((seg, i) => (
                  <div
                    key={`route-${i}`}
                    className="route-seg"
                    style={{ left: seg.left, top: seg.top, width: seg.width, transform: `rotate(${seg.angle}deg)` }}
                  />
                ))}
                {filteredPlaces.map((p) => {
                  const photo = photoForName(p.name);
                  return (
                    <button
                      key={p.id}
                      title={p.name}
                      className={`marker grave ${highlightedIds.has(p.id) ? 'highlight' : ''} ${String(activePlace?.id) === String(p.id) ? 'selected' : ''} ${photo ? 'has-photo' : ''}`}
                      style={{ left: p.x, top: p.y }}
                      onClick={(e) => { e.stopPropagation(); selectPlace(p); }}
                    >
                      {photo ? (
                        <img src={photo} alt={p.name} className="marker-photo" draggable={false} />
                      ) : (
                        p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')
                      )}
                    </button>
                  );
                })}
                {searchActive && INITIAL_CEMETERY_FEATURES.map((f) => (
                  <div key={f.id} className="marker entrance" style={{ left: f.x, top: f.y }} title={f.label}>⌂</div>
                ))}
              </div>
            </div>
            <div className="map-status">
              {searchActive
                ? filteredPlaces.length === 0
                  ? 'No match found — try another name'
                  : filteredPlaces.length === 1
                    ? `${filteredPlaces[0].name} found · route from Main Entrance`
                    : `${filteredPlaces.length} markers shown`
                : `${places.length} graves on the map`}
            </div>
          </div>

          <div className="detail-card">
            {activePlace ? (
              <div className="card">
                <span className="pill">Section {activePlace.section || '—'}</span>
                <h3 className="serif" style={{ margin: '0 0 10px', fontSize: 26 }}>{activePlace.name}</h3>
                {photoForName(activePlace.name) && (
                  <img className="hero-photo" src={photoForName(activePlace.name)} alt={activePlace.name} />
                )}
                <div className="fact"><span>Born</span><span>{activePlace.birthdate || 'N/A'}</span></div>
                <div className="fact"><span>Passed away</span><span>{activePlace.dod || 'N/A'}</span></div>
                <div className="fact" style={{ borderBottom: 0 }}><span>Section</span><span>{activePlace.section || 'N/A'}</span></div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                  <button className="btn btn-accent btn-sm" onClick={() => { setRouteId(activePlace.id); toast.success(`Route to ${activePlace.name} shown from the Main Entrance.`); }}>
                    Show Route
                  </button>
                  <Link className="btn btn-light btn-sm" to={`/grave/${activePlace.id}`}>Full Record</Link>
                  <button className="btn btn-light btn-sm" onClick={clearAll}>Clear</button>
                </div>
              </div>
            ) : filteredPlaces.length === 0 ? (
              <div className="card">
                <EmptyState title="No graves found" hint="Try a different spelling or clear the section filter." />
                <button className="btn btn-light btn-sm" onClick={clearAll}>Clear search</button>
              </div>
            ) : (
              <div className="card">
                <h3 className="serif" style={{ margin: '0 0 4px' }}>
                  {searchActive ? `${filteredPlaces.length} result${filteredPlaces.length === 1 ? '' : 's'}` : `All records (${places.length})`}
                </h3>
                <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 12px' }}>
                  Select a name to view the photo, details, and walking route.
                </p>
                <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                  {filteredPlaces.slice(0, 30).map((p) => (
                    <div key={p.id} className="list-item">
                      {photoForName(p.name) && <img src={photoForName(p.name)} alt="" className="list-thumb" />}
                      <span style={{ flex: 1, fontSize: 14 }}><b>{p.name}</b><br /><span style={{ color: 'var(--muted)' }}>Section {p.section}</span></span>
                      <button className="btn btn-accent btn-sm" onClick={() => selectPlace(p)}>View</button>
                    </div>
                  ))}
                </div>
                {filteredPlaces.length > 30 && (
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>Showing first 30 — refine your search.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
