import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useGraves } from '../graves.jsx';
import { photoForName } from '../data.js';
import { PageHero, SectionHead, EmptyState, useToast } from '../ui.jsx';
import { isSupabaseConfigured } from '../supabaseClient.js';

const PAGE_SIZE = 8;
const EMPTY_FORM = { name: '', section: '', birthdate: '', dod: '', x: '50%', y: '50%' };

export default function Admin() {
  const { isAdmin, adminEmail, authError, loginAdmin, logout } = useAuth();
  if (!isAdmin) return <AdminLogin onLogin={loginAdmin} authError={authError} />;
  return <Dashboard email={adminEmail} onLogout={logout} />;
}

function AdminLogin({ onLogin, authError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    const res = await onLogin(email, password);
    setBusy(false);
    if (res.ok) toast.success('Welcome back. You are signed in as admin.');
    else toast.error(res.error || 'Login failed.');
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="pill">Admin only</span>
        <h1 className="serif">Admin Login</h1>
        <p className="sub">
          {isSupabaseConfigured
            ? 'Sign in with your Supabase admin account to manage grave records.'
            : 'Supabase is not configured — local fallback login is Admin / 12345678.'}
        </p>
        <form onSubmit={submit}>
          <label className="field" htmlFor="a-email">Email / Username</label>
          <input id="a-email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" autoComplete="username" />
          <div style={{ marginTop: 12 }}>
            <label className="field" htmlFor="a-pass">Password</label>
            <input id="a-pass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </div>
          {authError && <p className="error-text">{authError}</p>}
          <button className="btn btn-gold" type="submit" disabled={busy} style={{ width: '100%', marginTop: 18 }}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
          <Link to="/">← Back to public site</Link>
        </p>
      </div>
    </div>
  );
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
  const openAdd = () => { setForm(EMPTY_FORM); setShowAdd(true); };
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
    setShowAdd(false);
    toast.success(`${form.name.trim()} added to Section ${form.section.trim()}.`);
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

          <div className="toolbar-row">
            <input className="input" style={{ maxWidth: 280 }} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search by name…" />
            <select className="select" style={{ maxWidth: 180 }} value={section} onChange={(e) => { setSection(e.target.value); setPage(1); }}>
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
        <Modal title="Add grave record" onClose={() => setShowAdd(false)}>
          <RecordForm form={form} setForm={setForm} onSubmit={submitAdd} busy={busy} submitLabel="Add Grave" onCancel={() => setShowAdd(false)} />
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
