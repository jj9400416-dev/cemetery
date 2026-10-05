import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useGraves } from '../graves.jsx';
import { supabase } from '../supabaseClient.js';
import { photoForName, mapImage } from '../data.js';
import { addCustomRoutes } from '../routing.js';
import { PageHero, EmptyState, useToast } from '../ui.jsx';

const PAGE_SIZE = 8;
const EMPTY_FORM = { name: '', section: '', birthdate: '', dod: '', x: '50%', y: '50%' };

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
  // Walking-route waypoints collected in the Add form, same mechanism
  // ("Add Route" tracer) as the Find a Grave page.
  const [routePts, setRoutePts] = useState([]);

  // Account approvals (admin_requests queue). Approving inserts the email
  // into public.admins; the login check matches on email.
  const [requests, setRequests] = useState([]);
  const [manualEmail, setManualEmail] = useState('');

  const loadRequests = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('admin_requests').select('*').order('created_at', { ascending: false });
    if (data) setRequests(data);
  };

  useEffect(() => { loadRequests(); }, []);

  const sections = useMemo(() => ['All', ...new Set(places.map((p) => p.section).filter(Boolean))], [places]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = places.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q)) &&
        (section === 'All' || p.section === section)
    );
    const by = {
      'name-asc': (a, b) => a.name.localeCompare(b.name),
      'name-desc': (a, b) => b.name.localeCompare(a.name),
      'section': (a, b) => String(a.section).localeCompare(String(b.section)),
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
    setForm({ name: p.name || '', section: p.section || '', birthdate: p.birthdate || '', dod: p.dod || '', x: p.x || '50%', y: p.y || '50%' });
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.section.trim()) {
      toast.error('Name and section are required.');
      return;
    }
    setBusy(true);
    const res = await addGrave({ name: form.name.trim(), section: form.section.trim(), level: 1, birthdate: form.birthdate.trim() || null, dod: form.dod.trim() || null, x: form.x || '50%', y: form.y || '50%' });
    setBusy(false);
    if (!res.ok) { toast.error('Database error: ' + res.error); return; }
    // Keep any traced waypoints: persist as a custom route for this grave,
    // exactly like the "Add Route" tracer on the Find a Grave page.
    if (routePts.length >= 2) {
      const grave = form.name.trim();
      if (supabase) {
        const { error } = await supabase
          .from('custom_routes')
          .upsert({ grave, waypoints: routePts, entrance: 'entranceMain' }, { onConflict: 'grave' });
        if (error) toast.error('Grave added, but route save failed: ' + error.message);
      }
      addCustomRoutes([{ grave, entrance: 'entranceMain', waypoints: routePts }]);
      toast.success(`${grave} added to Section ${form.section.trim()} with a ${routePts.length}-point route.`);
    } else {
      toast.success(`${form.name.trim()} added to Section ${form.section.trim()}.`);
    }
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
    const res = await updateGrave(editing.id, { name: form.name.trim(), section: form.section.trim(), birthdate: form.birthdate.trim() || null, dod: form.dod.trim() || null, x: form.x || '50%', y: form.y || '50%' });
    setBusy(false);
    if (!res.ok) { toast.error('Database error: ' + res.error); return; }
    setEditing(null);
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

  const approveRequest = async (email) => {
    if (!supabase) { toast.error('Database not connected.'); return; }
    const clean = String(email || '').trim();
    if (!clean) return;
    const { error: insErr } = await supabase.from('admins').insert({ email: clean });
    if (insErr && insErr.code !== '23505') {
      toast.error('Approve failed: ' + insErr.message);
      return;
    }
    await supabase.from('admin_requests').delete().eq('email', clean);
    toast.success(`${clean} approved as admin.`);
    loadRequests();
  };

  const declineRequest = async (email) => {
    if (!supabase) return;
    await supabase.from('admin_requests').delete().eq('email', email);
    toast.success(`${email} declined.`);
    loadRequests();
  };

  const newest = places.length ? [...places].sort((a, b) => Number(b.id) - Number(a.id))[0] : null;

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
            <div className="card"><div className="kicker">Latest entry</div><div style={{ fontWeight: 700 }}>{newest ? newest.name : '—'}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>{newest ? `Section ${newest.section}` : ''}</div></div>
          </div>

          <div className="card" style={{ marginBottom: 22 }}>
            <div className="kicker">Account approvals</div>
            <h3 className="serif" style={{ margin: '4px 0 12px' }}>
              Pending requests ({requests.length})
            </h3>
            {requests.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>No pending requests.</p>
            ) : (
              requests.map((r) => (
                <div key={r.email} className="list-item">
                  <span style={{ flex: 1, fontSize: 14 }}>
                    <b>{r.email}</b><br />
                    <span style={{ color: 'var(--muted)' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                    </span>
                  </span>
                  <button className="btn btn-green btn-sm" onClick={() => approveRequest(r.email)} style={{ marginRight: 6 }}>Approve</button>
                  <button className="btn btn-red btn-sm" onClick={() => declineRequest(r.email)}>Decline</button>
                </div>
              ))
            )}
            <form
              onSubmit={(e) => { e.preventDefault(); approveRequest(manualEmail); setManualEmail(''); }}
              style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}
            >
              <input
                className="input"
                style={{ flex: '1 1 220px' }}
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                placeholder="Approve an email directly…"
              />
              <button className="btn btn-accent btn-sm" type="submit">Approve email</button>
            </form>
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
                        <td><span className="pill">{p.section}</span></td>
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
          <RouteTracer points={routePts} onChange={setRoutePts} />
        </Modal>
      )}
      {editing && (
        <Modal title={`Edit — ${editing.name}`} onClose={() => setEditing(null)}>
          <RecordForm form={form} setForm={setForm} onSubmit={submitEdit} busy={busy} submitLabel="Save Changes" onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {deleting && (
        <Modal title="Remove this record?" onClose={() => setDeleting(null)}>
          <p>Permanently remove <b>{deleting.name}</b> (Section {deleting.section}) from the registry? This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-light" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn btn-red" disabled={busy} onClick={confirmDelete}>{busy ? 'Removing…' : 'Yes, Remove'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function RouteTracer({ points, onChange }) {
  const addPoint = (e) => {
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
  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--line, #e5dfc9)', paddingTop: 14 }}>
      <label className="field">Add route (optional) — tap the map in walking order from the Main Entrance</label>
      <div onClick={addPoint} style={{ position: 'relative', cursor: 'crosshair' }}>
        <img className="base" src={mapImage} alt="Cemetery map" style={{ width: '100%', borderRadius: 12, display: 'block' }} draggable={false} />
        {points.length > 1 && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} vectorEffect="non-scaling-stroke" style={{ stroke: '#ffd23e', strokeWidth: 2, strokeDasharray: '3 2', fill: 'none' }} />
          </svg>
        )}
        {points.map((p, i) => (
          <span key={`wp-${i}`} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: 16, height: 16, borderRadius: '50%', background: '#ffd23e', border: '2px solid #0f2a20', transform: 'translate(-50%, -50%)', fontSize: 9, fontWeight: 800, color: '#0f2a20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
        ))}
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
          <input className="input" value={form.section} onChange={set('section')} placeholder="A1" />
        </div>
        <div>
          <label className="field">Birthdate</label>
          <input className="input" value={form.birthdate} onChange={set('birthdate')} placeholder="January 15, 1940" />
        </div>
        <div>
          <label className="field">Date of death</label>
          <input className="input" value={form.dod} onChange={set('dod')} placeholder="February 10, 2020" />
        </div>
        <div>
          <label className="field">Map X (%)</label>
          <input className="input" value={form.x} onChange={set('x')} placeholder="65%" />
        </div>
        <div>
          <label className="field">Map Y (%)</label>
          <input className="input" value={form.y} onChange={set('y')} placeholder="13%" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn btn-light" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-green" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}
