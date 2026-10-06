import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useGraves } from '../graves.jsx';
import { supabase } from '../supabaseClient.js';
import { photoForName, mapImage, graveSection } from '../data.js';
import { addCustomRoutes, ROUTES } from '../routing.js';
import { PageHero, EmptyState, useToast } from '../ui.jsx';

const PAGE_SIZE = 8;
const EMPTY_FORM = { name: '', section: '', birthdate: '', dod: '', x: '50%', y: '50%' };

// Convert a stored free-text date (e.g. "January 15, 1940") to YYYY-MM-DD
// for the date picker; returns '' when it can't be parsed.
const toISODate = (str) => {
  if (!str) return '';
  const d = new Date(str);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

// Convert a picker value (YYYY-MM-DD) back to a stored "Month D, YYYY" string.
const fromISODate = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

export default function Admin() {
  const { isAdmin, isSignedIn, adminEmail, logout } = useAuth();
  const location = useLocation();
  // Not signed in → use the shared login page, then come back here.
  if (!isSignedIn) return <Navigate to={`/admin-login?next=${encodeURIComponent(location.pathname)}`} replace />;
  // Signed in but not an admin → no access to records management.
  if (!isAdmin) {
    return (
      <div className="container" style={{ padding: '60px 20px', maxWidth: 560 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🔒</div>
          <h1 className="serif">Admins only</h1>
          <p style={{ color: 'var(--muted)' }}>
            Signed in, but this account is not on the admin allow-list. This area is for approved admins — you can still add new graves from the map page.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <Link className="btn btn-pine" to="/find">Go to map</Link>
            <button className="btn btn-light" onClick={onLogout}>Logout</button>
          </div>
        </div>
      </div>
    );
  }
  return <Dashboard email={adminEmail} onLogout={logout} />;
}

function Dashboard({ email, onLogout }) {
  const { places, loading, dbError, databaseConnected, refresh, addGrave, removeGrave, updateGrave } = useGraves();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [section, setSection] = useState('All');
  const [sort, setSort] = useState('name-asc');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  // Walking-route waypoints for the grave currently being edited or added.
  const [routePts, setRoutePts] = useState([]);

  const sections = useMemo(() => ['All', ...new Set(places.map((p) => graveSection(p)).filter(Boolean))], [places]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = places.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q)) &&
        (section === 'All' || graveSection(p) === section)
    );
    const by = {
      'name-asc': (a, b) => a.name.localeCompare(b.name),
      'name-desc': (a, b) => b.name.localeCompare(a.name),
      'section': (a, b) => String(graveSection(a)).localeCompare(String(graveSection(b))),
      'newest': (a, b) => Number(b.id) - Number(a.id),
    }[sort];
    return [...list].sort(by);
  }, [places, query, section, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetFilters = () => { setQuery(''); setSection('All'); setPage(1); };
  const openAdd = () => { setForm(EMPTY_FORM); setRoutePts([]); setShowAdd(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({ name: p.name || '', section: graveSection(p) === '—' ? '' : graveSection(p), birthdate: toISODate(p.birthdate), dod: toISODate(p.dod), x: p.x || '50%', y: p.y || '50%' });
    // Pre-load the grave's existing walking route, if one is saved.
    const key = String(p.name || '').toLowerCase().replace(/[^a-z]/g, '');
    const existing = ROUTES.find((r) => String(r.grave || '').toLowerCase().replace(/[^a-z]/g, '') === key);
    setRoutePts(existing?.waypoints ? existing.waypoints.map((w) => ({ x: +w.x, y: +w.y })) : []);
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.section.trim()) {
      toast.error('Name and section are required.');
      return;
    }
    setBusy(true);
    // Register the traced route first so the new pin can snap to its end point.
    const grave = form.name.trim();
    const hasRoute = routePts.length >= 2;
    if (hasRoute) addCustomRoutes([{ grave, entrance: 'entranceMain', waypoints: routePts }]);
    const res = await addGrave({ name: form.name.trim(), section: form.section.trim(), level: 1, birthdate: form.birthdate ? fromISODate(form.birthdate) : null, dod: form.dod ? fromISODate(form.dod) : null, x: form.x || '50%', y: form.y || '50%' });
    setBusy(false);
    if (!res.ok) { toast.error('Database error: ' + res.error); return; }
    // Persist any traced walking-route waypoints for the new grave.
    if (hasRoute && supabase) {
      const { error } = await supabase
        .from('custom_routes')
        .upsert({ grave, waypoints: routePts, entrance: 'entranceMain' }, { onConflict: 'grave' });
      if (error) toast.error('Record added, but route save failed: ' + error.message);
    }
    toast.success(`${form.name.trim()} added to Section ${form.section.trim()}.`);
    setShowAdd(false);
    setRoutePts([]);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.section.trim()) {
      toast.error('Name and section are required.');
      return;
    }
    setBusy(true);
    const res = await updateGrave(editing.id, { name: form.name.trim(), section: form.section.trim(), birthdate: form.birthdate ? fromISODate(form.birthdate) : null, dod: form.dod ? fromISODate(form.dod) : null, x: form.x || '50%', y: form.y || '50%' });
    setBusy(false);
    if (!res.ok) { toast.error('Database error: ' + res.error); return; }
    // Persist any traced walking-route waypoints for this grave.
    if (routePts.length >= 2) {
      const grave = form.name.trim();
      if (supabase) {
        const { error } = await supabase
          .from('custom_routes')
          .upsert({ grave, waypoints: routePts, entrance: 'entranceMain' }, { onConflict: 'grave' });
        if (error) toast.error('Record updated, but route save failed: ' + error.message);
      }
      addCustomRoutes([{ grave, entrance: 'entranceMain', waypoints: routePts }]);
    }
    setEditing(null);
    setRoutePts([]);
    toast.success('Record updated.');
  };

  const confirmDelete = async () => {
    setBusy(true);
    const res = await removeGrave(deleting.id);
    setBusy(false);
    if (!res.ok) { toast.error('Database error: ' + res.error); return; }
    toast.success(`${deleting.name} removed.`);
    setDeleting(null);
  };

  const newest = places.length ? [...places].sort((a, b) => Number(b.id) - Number(a.id))[0] : null;

  const downloadFile = (filename, content, type = 'text/csv;charset=utf-8') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const exportCsv = () => {
    const header = ['Name', 'Section', 'Born', 'Passed away', 'Map X', 'Map Y'];
    const lines = rows.map((p) => [csvEscape(p.name), csvEscape(graveSection(p)), csvEscape(p.birthdate), csvEscape(p.dod), csvEscape(p.x), csvEscape(p.y)].join(','));
    downloadFile(`grave-records-${new Date().toISOString().slice(0, 10)}.csv`, [header.join(','), ...lines].join('\n'));
    toast.success(`${rows.length} record${rows.length === 1 ? '' : 's'} exported.`);
  };

  const exportSectionSummary = () => {
    const counts = {};
    for (const p of places) counts[graveSection(p)] = (counts[graveSection(p)] || 0) + 1;
    const lines = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])).map(([s, n]) => `${csvEscape(s)},${n}`);
    downloadFile(`section-summary-${new Date().toISOString().slice(0, 10)}.csv`, ['Section,Total graves', ...lines].join('\n'));
    toast.success('Section summary exported.');
  };

  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Popup blocked — allow popups to print.'); return; }
    const counts = {};
    for (const p of places) counts[graveSection(p)] = (counts[graveSection(p)] || 0) + 1;
    w.document.write(`<!doctype html><html><head><title>Cemetery Records Report</title>
      <style>body{font-family:Georgia,serif;padding:32px;color:#222}h1{margin-bottom:4px}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px}th{background:#0f2a20;color:#fff}</style></head><body>
      <h1>Agnipa Memorial Park — Records Report</h1>
      <p>Generated ${new Date().toLocaleString()} · Signed in as ${email}</p>
      <h2>Summary</h2>
      <p>Total records: <b>${places.length}</b> · Sections: <b>${Object.keys(counts).length}</b></p>
      <table><thead><tr><th>Section</th><th>Total graves</th></tr></thead><tbody>
      ${Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])).map(([s, n]) => `<tr><td>${s}</td><td>${n}</td></tr>`).join('')}
      </tbody></table>
      <h2>Records (current view — ${rows.length})</h2>
      <table><thead><tr><th>Name</th><th>Section</th><th>Born</th><th>Passed</th></tr></thead><tbody>
      ${rows.map((p) => `<tr><td>${p.name}</td><td>${graveSection(p)}</td><td>${p.birthdate || '—'}</td><td>${p.dod || '—'}</td></tr>`).join('')}
      </tbody></table>
      <script>window.print();</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      <PageHero
        eyebrow={`Signed in as ${email}`}
        title="Records Dashboard."
        subtitle="Search, add, correct, and organize every grave in the park registry."
      />
      <section className="section" style={{ paddingTop: 36 }}>
        <div className="container">
          <div className="grid grid-4" style={{ marginBottom: 22 }}>
            <div className="card"><div className="kicker">Total records</div><div className="serif" style={{ fontSize: 36 }}>{places.length}</div></div>
            <div className="card"><div className="kicker">Sections</div><div className="serif" style={{ fontSize: 36 }}>{sections.length - 1}</div></div>
            <div className="card"><div className="kicker">Database</div><div className="serif" style={{ fontSize: 24 }}><span className={`status-dot ${databaseConnected ? 'on' : 'off'}`} />{databaseConnected ? 'Connected' : 'Local mode'}</div></div>
            <div className="card"><div className="kicker">Latest entry</div><div style={{ fontWeight: 700 }}>{newest ? newest.name : '—'}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>{newest ? `Section ${graveSection(newest)}` : ''}</div></div>
          </div>

          <div className="card" style={{ marginBottom: 22 }}>
            <div className="kicker">Reports</div>
            <h3 className="serif" style={{ margin: '4px 0 12px' }}>Generate reports</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-green btn-sm" onClick={exportCsv}>⬇ Export CSV (current view)</button>
              <button className="btn btn-light btn-sm" onClick={exportSectionSummary}>⬇ Section summary (CSV)</button>
              <button className="btn btn-accent btn-sm" onClick={printReport}>🖨 Print report</button>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0' }}>
              Exports use the current search/section filters.
            </p>
          </div>

          <div className="toolbar-row">            <input className="input" style={{ maxWidth: 280 }} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search by name…" />            <select className="select" style={{ maxWidth: 180 }} value={section} onChange={(e) => { setSection(e.target.value); setPage(1); }}>
              {sections.map((s) => <option key={s} value={s}>{s === 'All' ? 'All sections' : `Section ${s}`}</option>)}
            </select>
            <select className="select" style={{ maxWidth: 180 }} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="section">By section</option>
              <option value="newest">Newest first</option>
            </select>
            <button className="btn btn-light btn-sm" onClick={resetFilters}>Reset</button>
            <span style={{ flex: 1 }} />
            <button className="btn btn-light btn-sm" onClick={refresh}>↻ Refresh</button>
            <button className="btn btn-green btn-sm" onClick={openAdd}>+ Add Grave</button>
            <button className="btn btn-light btn-sm" onClick={onLogout}>Logout</button>
          </div>

          {dbError && <p className="error-text">Database: {dbError}</p>}
          {loading ? (
            <div className="skeleton" style={{ height: 320 }} />
          ) : rows.length === 0 ? (
            <div className="card"><EmptyState title="No records match" hint="Adjust your search or add a new grave record." /></div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="records">
                  <thead>
                    <tr><th></th><th>Name</th><th>Section</th><th>Born</th><th>Passed</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {pageRows.map((p) => (
                      <tr key={p.id}>
                        <td>{photoForName(p.name) ? <img className="row-thumb" src={photoForName(p.name)} alt="" /> : <span>✝</span>}</td>
                        <td><b>{p.name}</b></td>
                        <td><span className="pill">{graveSection(p)}</span></td>
                        <td>{p.birthdate || '—'}</td>
                        <td>{p.dod || '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <Link className="btn btn-light btn-sm" to={`/grave/${p.id}`} style={{ marginRight: 6 }}>View</Link>
                          <button className="btn btn-accent btn-sm" onClick={() => openEdit(p)} style={{ marginRight: 6 }}>Edit</button>
                          <button className="btn btn-red btn-sm" onClick={() => setDeleting(p)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <span>Page {page} of {totalPages} · {rows.length} record{rows.length === 1 ? '' : 's'}</span>
                <button className="btn btn-light btn-sm" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>← Prev</button>
                <button className="btn btn-light btn-sm" disabled={page >= totalPages} onClick={() => setPage((v) => v + 1)}>Next →</button>
              </div>
            </>
          )}
        </div>
      </section>

      {showAdd && (
        <Modal title="Add grave record" onClose={() => { setShowAdd(false); setRoutePts([]); }}>
          <RecordForm form={form} setForm={setForm} onSubmit={submitAdd} busy={busy} submitLabel="Add Grave" onCancel={() => { setShowAdd(false); setRoutePts([]); }} />
          <RouteTracer points={routePts} onChange={setRoutePts} label="Add route (optional)" />
        </Modal>
      )}
      {editing && (
        <Modal title={`Edit — ${editing.name}`} onClose={() => { setEditing(null); setRoutePts([]); }}>
          <RecordForm form={form} setForm={setForm} onSubmit={submitEdit} busy={busy} submitLabel="Save Changes" onCancel={() => { setEditing(null); setRoutePts([]); }} />
          <RouteTracer points={routePts} onChange={setRoutePts} label="Edit route" />
        </Modal>
      )}
      {deleting && (
        <Modal title="Remove this record?" onClose={() => setDeleting(null)}>
          <p>Permanently remove <b>{deleting.name}</b> (Section {graveSection(deleting)}) from the registry? This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-light" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn btn-red" disabled={busy} onClick={confirmDelete}>{busy ? 'Removing…' : 'Yes, Remove'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function RouteTracer({ points, onChange, label = 'Add route (optional)' }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [locked, setLocked] = useState(false);
  const dragRef = useRef({ dragging: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const movedRef = useRef(false);

  const addPoint = (e) => {
    if (movedRef.current) { movedRef.current = false; return; }
    const img = e.currentTarget.querySelector('img.base');
    if (!img) return;
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    if (x < 0 || y < 0 || x > 100 || y > 100) return;
    const clamp = (v) => Math.min(100, Math.max(0, +v.toFixed(2)));
    onChange([...points, { x: clamp(x), y: clamp(y) }]);
  };

  const onMouseDown = (e) => {
    movedRef.current = false;
    if (locked) return;
    dragRef.current = { dragging: true, sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current.dragging || locked) return;
    movedRef.current = true;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.sx),
      y: dragRef.current.oy + (e.clientY - dragRef.current.sy),
    });
  };
  const onMouseUp = () => { dragRef.current.dragging = false; };

  const invScale = 1 / (zoom || 1);

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--line, #e5dfc9)', paddingTop: 14 }}>
      <label className="field">{label} — tap the map in walking order from the Main Entrance</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button type="button" className="btn btn-light btn-sm" onClick={() => setZoom((z) => Math.min(2.6, +(z + 0.2).toFixed(2)))}>+</button>
        <button type="button" className="btn btn-light btn-sm" onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))}>−</button>
        <button type="button" className="btn btn-light btn-sm" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} style={{ fontSize: 12 }}>Reset</button>
        <button type="button" className="btn btn-light btn-sm" onClick={() => setLocked((v) => !v)} style={{ fontSize: 12 }}>{locked ? 'Unlock' : 'Lock'}</button>
      </div>
      <div
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={addPoint}
        style={{ cursor: 'crosshair', overflow: 'hidden', position: 'relative', borderRadius: 12 }}
      >
        <div style={{ position: 'relative', transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)` }}>
          <img className="base" src={mapImage} alt="Cemetery map" draggable={false} style={{ width: '100%', borderRadius: 12, display: 'block' }} />
          {points.length > 1 && (
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} vectorEffect="non-scaling-stroke" style={{ stroke: '#ffd23e', strokeWidth: 2, strokeDasharray: '3 2', fill: 'none' }} />
            </svg>
          )}
          {points.map((p, i) => (
            <span key={`wp-${i}`} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: 16, height: 16, borderRadius: '50%', background: '#ffd23e', border: '2px solid #0f2a20', transform: `translate(-50%, -50%) scale(${invScale})`, fontSize: 9, fontWeight: 800, color: '#0f2a20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {points.length === 0 ? 'No waypoints yet.' : `${points.length} waypoint${points.length === 1 ? '' : 's'}${points.length < 2 ? ' — tap at least 2 (entrance + grave).' : ''}`}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-light btn-sm" onClick={() => onChange(points.slice(0, -1))} disabled={points.length === 0}>Undo point</button>
        <button type="button" className="btn btn-light btn-sm" onClick={() => onChange([])} disabled={points.length === 0}>Clear</button>
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="serif">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function RecordForm({ form, setForm, onSubmit, busy, submitLabel, onCancel }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <form onSubmit={onSubmit}>
      <div className="form-grid">
        <div>
          <label className="field">Full name *</label>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Juan Dela Cruz" />
        </div>
        <div>
          <label className="field">Section *</label>
          <input className="input" value={form.section} onChange={set('section')} placeholder="S1" />
        </div>
        <div>
          <label className="field">Birthdate</label>
          <input className="input" type="date" value={form.birthdate} onChange={set('birthdate')} />
        </div>
        <div>
          <label className="field">Date of death</label>
          <input className="input" type="date" value={form.dod} onChange={set('dod')} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn btn-light" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-green" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}
