import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useGraves } from '../graves.jsx';
import { useAuth } from '../auth.jsx';
import { supabase } from '../supabaseClient.js';
import { useToast, EmptyState } from '../ui.jsx';
import { photoForName, mapImage, INITIAL_CEMETERY_FEATURES, INITIAL_MAP_SECTIONS } from '../data.js';
import { getRoute, addCustomRoutes } from '../routing.js';

const parsePercent = (v) => parseFloat(String(v).replace('%', '')) || 0;
const toPt = (p) => (p?.x == null || p?.y == null ? null : { x: parsePercent(p.x), y: parsePercent(p.y) });

// The map displays `assets/agnipa map.jpg` as the base image. Section highlights,
// grave pins, entrances and routes are drawn as overlays on top.
// Stored coordinates are percent of the canonical base frame (agnipa map.jpg),
// so they map straight onto this image.
const toAgnipaX = parsePercent;
const toAgnipaY = parsePercent;
const fromAgnipaX = (v) => parsePercent(v);
const fromAgnipaY = (v) => parsePercent(v);

export default function FindGrave() {
  const { places, loading, dbError, databaseConnected, addGrave } = useGraves();
  const { isSignedIn, isAdmin } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [searchText, setSearchText] = useState(params.get('name') || '');
  const [activeId, setActiveId] = useState(null);
  const [routeId, setRouteId] = useState(null);
  const [sectionFilter, setSectionFilter] = useState(params.get('section') || 'All');
  const [mapZoom, setMapZoom] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [mapLocked, setMapLocked] = useState(false);
  const [routeFlash, setRouteFlash] = useState(0);
  // Contribute mode (signed-in users): fill the form, tap the map to place
  // the pin, submit. The walking route is auto-computed from the walkways.
  const [placing, setPlacing] = useState(false);
  const [pendingPt, setPendingPt] = useState(null);
  const [newName, setNewName] = useState('');
  const [newSection, setNewSection] = useState('');
  const [newBirth, setNewBirth] = useState('');
  const [newDod, setNewDod] = useState('');
  // Add-route tracer (approved accounts): pick a grave, tap waypoints in
  // walking order, save. Saved routes win over bundled extractions.
  const [tracing, setTracing] = useState(false);
  const [routePts, setRoutePts] = useState([]);
  const [routeGrave, setRouteGrave] = useState('');
  const [customRev, setCustomRev] = useState(0);
  const dragRef = useRef({ dragging: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const movedRef = useRef(false);
  const mapCardRef = useRef(null);

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

  // Only auto-select the first match when the visitor is actually searching.
  // Otherwise (fresh "Open Cemetery Map") nothing is preselected, so Juan
  // Dela Cruz is not shown as the default result.
  const hasQuery = searchText.trim() !== '' || sectionFilter !== 'All';
  const activePlace = activeId != null
    ? places.find((p) => String(p.id) === String(activeId)) || null
    : (hasQuery ? filteredPlaces[0] : null) || null;
  const routeTarget = places.find((p) => String(p.id) === String(routeId)) || null;
  const routeAnchor = routeTarget || activePlace;

  const activeSectionId = activePlace?.section || null;
  const routeOrigin = INITIAL_CEMETERY_FEATURES.find((f) => f.id === 'entranceMain');
  const route = useMemo(
    () => getRoute(routeAnchor?.name, toPt(routeAnchor), toPt(routeOrigin)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeAnchor?.name, routeAnchor?.x, routeAnchor?.y, routeOrigin?.x, routeOrigin?.y, customRev]
  );
  const routePoints = route?.points || [];

  const searchActive = searchText.trim() !== '' || sectionFilter !== 'All';
  const invScale = 1 / (mapZoom || 1);

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

  // "Show Route" previously only fired a toast while the route was often
  // already drawn (or off-screen on mobile). Now it also brings the map into
  // view and pulses the route line so the tap has a visible effect.
  const showRoute = (p) => {
    setRouteId(p.id);
    setRouteFlash((n) => n + 1);
    mapCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast.success(`Route to ${p.name} shown from the Main Entrance.`);
  };

  const onMouseDown = (e) => {
    movedRef.current = false;
    if (mapLocked) return;
    dragRef.current = { dragging: true, sx: e.clientX, sy: e.clientY, ox: mapOffset.x, oy: mapOffset.y };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current.dragging || mapLocked) return;
    movedRef.current = true;
    setMapOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.sx),
      y: dragRef.current.oy + (e.clientY - dragRef.current.sy),
    });
  };
  const onMouseUp = () => {
    dragRef.current.dragging = false;
  };

  // Tap-to-place while contributing: click % on the displayed map frame
  // is converted back to canonical base percent for storage.
  const framePoint = (e) => {
    const img = e.currentTarget.querySelector('img.base');
    if (!img) return null;
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const fx = ((e.clientX - r.left) / r.width) * 100;
    const fy = ((e.clientY - r.top) / r.height) * 100;
    if (fx < 0 || fy < 0 || fx > 100 || fy > 100) return null;
    const clamp = (v) => Math.min(100, Math.max(0, +v.toFixed(2)));
    return { x: clamp(fromAgnipaX(fx)), y: clamp(fromAgnipaY(fy)) };
  };

  const onMapClick = (e) => {
    if (movedRef.current) { movedRef.current = false; return; }
    if (placing) {
      const pt = framePoint(e);
      if (pt) setPendingPt(pt);
      return;
    }
    if (tracing) {
      const pt = framePoint(e);
      if (pt) setRoutePts((prev) => [...prev, pt]);
    }
  };

  const submitGrave = async (e) => {
    e?.preventDefault();
    if (!newName.trim() || !newSection) {
      toast.error('Name and section are required.');
      return;
    }
    if (!pendingPt) {
      toast.error('Tap the map to place the grave pin first.');
      return;
    }
    const res = await addGrave({
      name: newName.trim(),
      section: newSection,
      level: 1,
      birthdate: newBirth.trim() || null,
      dod: newDod.trim() || null,
      x: `${pendingPt.x}%`,
      y: `${pendingPt.y}%`,
    });
    if (!res.ok) {
      toast.error('Could not save: ' + res.error);
      return;
    }
    const savedName = newName.trim();
    setNewName('');
    setNewSection('');
    setNewBirth('');
    setNewDod('');
    setPendingPt(null);
    setPlacing(false);
    toast.success(`${savedName} added — search the name to see its walking route.`);
  };

  const saveRoute = async (e) => {
    e?.preventDefault();
    const gname = routeGrave || activePlace?.name || '';
    if (!gname) {
      toast.error('Select a grave first.');
      return;
    }
    if (routePts.length < 2) {
      toast.error('Tap at least 2 points on the map, from the entrance to the grave.');
      return;
    }
    if (supabase) {
      const { error } = await supabase
        .from('custom_routes')
        .upsert({ grave: gname, waypoints: routePts, entrance: 'entranceMain' }, { onConflict: 'grave' });
      if (error) {
        toast.error('Could not save: ' + error.message);
        return;
      }
    }
    addCustomRoutes([{ grave: gname, entrance: 'entranceMain', waypoints: routePts }]);
    setCustomRev((v) => v + 1);
    setRoutePts([]);
    setTracing(false);
    toast.success(`Route saved for ${gname} — search the name to walk it.`);
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
          <div className="map-card" ref={mapCardRef}>
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
              onClick={onMapClick}
              style={(placing || tracing) ? { cursor: 'crosshair' } : undefined}
            >
              <div className="map-inner">
                <div
                  className="map-frame"
                  style={{ transform: `scale(${mapZoom}) translate(${mapOffset.x / mapZoom}px, ${mapOffset.y / mapZoom}px)` }}
                >
                <img className="base" src={mapImage} alt="Cemetery map" draggable={false} />

                {/* Grave pins stay hidden until the visitor searches a name —
                    then matching markers appear. The selected grave keeps its pin. */}
                {(searchActive ? filteredPlaces : activePlace ? [activePlace] : []).map((p) => {
                  const isSelected = String(activePlace?.id) === String(p.id);
                  return (
                    <button
                      key={p.id}
                      title={p.name}
                      className={`marker-pin${isSelected ? ' selected' : ''}`}
                      style={{ left: `${toAgnipaX(p.x)}%`, top: `${toAgnipaY(p.y)}%`, transform: `translate(-50%, -100%) scale(${invScale})`, transformOrigin: '50% 100%' }}
                      onClick={(e) => { e.stopPropagation(); selectPlace(p); }}
                    >
                      <svg viewBox="0 0 24 34" aria-hidden="true">
                        <path d="M12 0C5.4 0 0 5.6 0 12.5 0 22 12 34 12 34s12-12 12-21.5C24 5.6 18.6 0 12 0z" fill={isSelected ? '#c9a227' : '#c0392b'} stroke="#fff" strokeWidth="1.6" />
                        <circle cx="12" cy="12.5" r="4.6" fill="#fff" />
                      </svg>
                    </button>
                  );
                })}
                <svg className="route-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {routePoints.length > 1 && (
                    <polyline
                      points={routePoints.map((p) => `${p.x},${p.y}`).join(' ')}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
                {searchActive && INITIAL_CEMETERY_FEATURES.map((f) => (
                  <div key={f.id} className="marker entrance" style={{ left: `${toAgnipaX(f.x)}%`, top: `${toAgnipaY(f.y)}%`, transform: `translate(-50%, -50%) scale(${invScale})` }} title={f.label}>⌂</div>
                ))}
                {pendingPt && (
                  <span
                    className="marker-pin selected"
                    style={{ left: `${toAgnipaX(pendingPt.x)}%`, top: `${toAgnipaY(pendingPt.y)}%`, transform: `translate(-50%, -100%) scale(${invScale})`, transformOrigin: '50% 100%' }}
                    title="New grave location"
                  >
                    <svg viewBox="0 0 24 34" aria-hidden="true">
                      <path d="M12 0C5.4 0 0 5.6 0 12.5 0 22 12 34 12 34s12-12 12-21.5C24 5.6 18.6 0 12 0z" fill="#c9a227" stroke="#fff" strokeWidth="1.6" />
                      <circle cx="12" cy="12.5" r="4.6" fill="#fff" />
                    </svg>
                  </span>
                )}
                {tracing && routePts.length > 0 && (
                  <svg className="route-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline
                      points={routePts.map((p) => `${toAgnipaX(p.x)},${toAgnipaY(p.y)}`).join(' ')}
                      vectorEffect="non-scaling-stroke"
                      style={{ stroke: '#ffd23e', strokeWidth: 2, strokeDasharray: '3 2', opacity: 0.95 }}
                    />
                  </svg>
                )}
                {tracing && routePts.map((p, i) => (
                  <span
                    key={`wp-${i}`}
                    title={`Waypoint ${i + 1}`}
                    style={{
                      position: 'absolute', left: `${toAgnipaX(p.x)}%`, top: `${toAgnipaY(p.y)}%`,
                      width: 12, height: 12, borderRadius: '50%', background: '#ffd23e',
                      border: '2px solid #0f2a20', transform: 'translate(-50%, -50%)', zIndex: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 800, color: '#0f2a20',
                    }}
                  >
                    {i + 1}
                  </span>
                ))}
                </div>
              </div>
            </div>
            <div className="map-legend" aria-label="Map legend">
              <span className="lg-title">Legend</span>
              <span className="lg-item">
                <svg viewBox="0 0 24 34" width="11" height="15" aria-hidden="true"><path d="M12 0C5.4 0 0 5.6 0 12.5 0 22 12 34 12 34s12-12 12-21.5C24 5.6 18.6 0 12 0z" fill="#c0392b" stroke="#fff" strokeWidth="1.6" /><circle cx="12" cy="12.5" r="4.6" fill="#fff" /></svg>
                Grave
              </span>
              <span className="lg-item">
                <svg viewBox="0 0 24 34" width="11" height="15" aria-hidden="true"><path d="M12 0C5.4 0 0 5.6 0 12.5 0 22 12 34 12 34s12-12 12-21.5C24 5.6 18.6 0 12 0z" fill="#c9a227" stroke="#fff" strokeWidth="1.6" /><circle cx="12" cy="12.5" r="4.6" fill="#fff" /></svg>
                Selected
              </span>

              <span className="lg-item">
                <svg width="22" height="6" aria-hidden="true"><line x1="0" y1="3" x2="22" y2="3" stroke="#ff8a00" strokeWidth="3" strokeLinecap="round" /></svg>
                Walking route
              </span>
              <span className="lg-item"><span className="lg-door">⌂</span> Entrance</span>
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
                  <button className="btn btn-accent btn-sm" onClick={() => showRoute(activePlace)}>
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
                <img src={mapImage} alt="Agnipa Memorial Park" className="hero-photo" />
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
            {!loading && isSignedIn && !isAdmin && (
              <div className="card" style={{ marginTop: 18 }}>
                <span className="pill">Contribute</span>
                <h3 className="serif" style={{ margin: '6px 0 10px' }}>Add a grave</h3>
                <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 12px' }}>
                  Fill in the details, tap the map to drop the pin, then save. The walking route is computed automatically.
                </p>
                <form onSubmit={submitGrave}>
                  <label className="field">Full name *</label>
                  <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label className="field">Section *</label>
                      <select className="input" value={newSection} onChange={(e) => setNewSection(e.target.value)} style={{ width: '100%' }}>
                        <option value="">Select…</option>
                        {sections.filter((s) => s !== 'All').map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label className="field">Born</label>
                      <input className="input" value={newBirth} onChange={(e) => setNewBirth(e.target.value)} placeholder="e.g. 1940" style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="field">Passed away</label>
                      <input className="input" value={newDod} onChange={(e) => setNewDod(e.target.value)} placeholder="e.g. 2020" style={{ width: '100%' }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className={placing ? 'btn btn-red btn-sm' : 'btn btn-light btn-sm'}
                    onClick={() => setPlacing((v) => !v)}
                    style={{ width: '100%', marginTop: 12 }}
                  >
                    {placing ? '✕ Cancel placing' : '📍 Tap map to set location'}
                  </button>
                  {pendingPt && (
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 0' }}>
                      Pin at {pendingPt.x}%, {pendingPt.y}% — tap the map again to move it.
                    </p>
                  )}
                  <button className="btn btn-green" type="submit" style={{ width: '100%', marginTop: 12 }}>
                    Add grave
                  </button>
                </form>
              </div>
            )}
            {!loading && !isSignedIn && (
              <div className="card" style={{ marginTop: 18, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 14 }}>
                  Know a grave that's missing? <Link to="/signup">Create a free account</Link> to add it to the map.
                </p>
              </div>
            )}
            {!loading && (
              <div className="card" style={{ marginTop: 18 }}>
                <span className="pill">Walking routes</span>
                <h3 className="serif" style={{ margin: '6px 0 10px' }}>Add Route</h3>
                {isSignedIn ? (
                  <form onSubmit={saveRoute}>
                    <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 12px' }}>
                      Pick a grave, trace its path from the Main Entrance by tapping the map in order, then save. Saved routes replace the default one.
                    </p>
                    <label className="field">Grave *</label>
                    <select className="input" value={routeGrave} onChange={(e) => setRouteGrave(e.target.value)} style={{ width: '100%' }}>
                      <option value="">{activePlace ? `${activePlace.name} (selected)` : 'Select grave…'}</option>
                      {places.map((p) => (
                        <option key={p.id} value={p.name}>{p.name} — Section {p.section}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={tracing ? 'btn btn-red btn-sm' : 'btn btn-light btn-sm'}
                      onClick={() => setTracing((v) => !v)}
                      style={{ width: '100%', marginTop: 12 }}
                    >
                      {tracing ? '✕ Stop tracing' : 'Start tracing'}
                    </button>
                    {routePts.length > 0 && (
                      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 0' }}>
                        {routePts.length} waypoint{routePts.length === 1 ? '' : 's'} — keep tapping, or save.
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button type="button" className="btn btn-light btn-sm" onClick={() => setRoutePts([])} style={{ flex: 1 }}>
                        Clear points
                      </button>
                      <button className="btn btn-green btn-sm" type="submit" style={{ flex: 2 }}>
                        Save route
                      </button>
                    </div>
                  </form>
                ) : (
                  <p style={{ margin: 0, fontSize: 14 }}>
                    You must create an account to add routes. <Link to="/signup">Create a free account</Link> — approval is instant.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
