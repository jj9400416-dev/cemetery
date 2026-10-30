import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useGraves } from '../graves.jsx';
import { useRecords } from '../records.jsx';
import { useSurvey } from '../survey.jsx';
import { supabase } from '../supabaseClient.js';
import { photoForName, mapImage, graveSection, INITIAL_MAP_SECTIONS } from '../data.js';
import {
  SURVEY_QUESTIONS,
  SURVEY_SECTIONS,
  RESPONDENT_PROFILE_COLUMNS,
  LIKERT_OPTIONS,
  computeWeightedMean,
  interpretMean,
  answeredCount,
  isAnswered,
} from '../surveyData.js';
import { addCustomRoutes, ROUTES } from '../routing.js';
import { PageHero, EmptyState, useToast } from '../ui.jsx';

const PAGE_SIZE = 8;
const RECORDS_PAGE_SIZE = 12;
const EMPTY_FORM = { name: '', section: '', birthdate: '', dod: '', x: '50%', y: '50%' };
const EMPTY_RECORD = { name: '', dod: '', status: 'deceased', remarks: '' };

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

// Split a registry name ("SURNAME, FIRSTNAME") into its two parts.
const splitName = (name) => {
  const [surname, ...rest] = String(name || '').split(',');
  return { surname: (surname || '').trim() || null, given_name: rest.join(',').trim() || null };
};

// Pull the last 4-digit year out of a free-text date, for sorting/filtering.
const yearFromText = (text) => {
  const m = String(text || '').match(/(?:19|20)\d{2}/g);
  return m ? Number(m[m.length - 1]) : null;
};

// Compare names across the registry ("ABELLO, CONCEPCION") and map graves
// ("Abello, Concepcion") by stripping case and punctuation.
const normalizeName = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

// Registry death dates are free text ("2/5/2012", "DIED 2007"). Normalize the
// parseable ones to "Month D, YYYY" for display; keep everything else verbatim.
const formatDodText = (text) => {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^\d{4}$/.test(t)) return t; // bare year — no month/day to invent
  const d = new Date(t);
  if (isNaN(d.getTime()) || d.getFullYear() < 1000 || d.getFullYear() > 2100) return t;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
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
            <button className="btn btn-light" onClick={logout}>Logout</button>
          </div>
        </div>
      </div>
    );
  }
  return <Dashboard email={adminEmail} />;
}

function Dashboard({ email }) {
  const [tab, setTab] = useState('registry');
  const { records } = useRecords();
  const { responses } = useSurvey();

  return (
    <>
      <PageHero
        eyebrow={`Signed in as ${email}`}
        title="Records Dashboard."
        subtitle="Search, add, correct, and organize every record kept by the park."
      />
      <section className="section" style={{ paddingTop: 36 }}>
        <div className="container">
          <div className="toolbar-row" style={{ marginBottom: 22 }}>
            <button
              className={tab === 'registry' ? 'btn btn-green btn-sm' : 'btn btn-light btn-sm'}
              onClick={() => setTab('registry')}
            >
              📖 Registry ({records.length})
            </button>
            <button
              className={tab === 'graves' ? 'btn btn-green btn-sm' : 'btn btn-light btn-sm'}
              onClick={() => setTab('graves')}
            >
              🗺️ Map graves
            </button>
            <button
              className={tab === 'survey' ? 'btn btn-green btn-sm' : 'btn btn-light btn-sm'}
              onClick={() => setTab('survey')}
            >
              📊 Survey ({responses.length})
            </button>
            <span style={{ flex: 1 }} />
          </div>
          {tab === 'registry' ? (
            <RegistryPanel />
          ) : tab === 'graves' ? (
            <GravesPanel email={email} />
          ) : (
            <SurveyPanel />
          )}
        </div>
      </section>
    </>
  );
}

// ---- Deceased registry (public.deceased) -----------------------------------
function RegistryPanel() {
  const { records, loading, dbError, databaseConnected, refresh, addRecord, updateRecord, removeRecord } = useRecords();
  // Map-grave side of "Show on map": place/update the pin and walking route.
  const { places, addGrave, updateGrave } = useGraves();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [view, setView] = useState('All');
  const [sort, setSort] = useState('name-asc');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState(EMPTY_RECORD);
  const [busy, setBusy] = useState(false);
  // Registry record currently being pushed to the map-graves list.
  const [publishing, setPublishing] = useState(null);
  const [publishForm, setPublishForm] = useState({ name: '', section: '', birthdate: '', dod: '', x: '50%', y: '50%' });
  const [publishRoutePts, setPublishRoutePts] = useState([]);
  const [publishBusy, setPublishBusy] = useState(false);

  const counts = useMemo(
    () => ({
      total: records.length,
      deceased: records.filter((r) => r.status === 'deceased').length,
      reserved: records.filter((r) => r.status === 'reserved').length,
      needsVerification: records.filter((r) => r.needs_verification).length,
    }),
    [records]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = records.filter((r) => {
      const hay = `${r.name || ''} ${r.surname || ''} ${r.given_name || ''}`.toLowerCase();
      const matchQ = !q || hay.includes(q);
      const matchView =
        view === 'All' ||
        (view === 'needs_verification' ? !!r.needs_verification : r.status === view);
      return matchQ && matchView;
    });
    const by = {
      'name-asc': (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
      'name-desc': (a, b) => String(b.name || '').localeCompare(String(a.name || '')),
      'year-new': (a, b) => (Number(b.dod_year) || 0) - (Number(a.dod_year) || 0),
      'year-old': (a, b) => (Number(a.dod_year) || 0) - (Number(b.dod_year) || 0),
      'flag': (a, b) => Number(b.needs_verification) - Number(a.needs_verification),
    }[sort];
    return [...list].sort(by);
  }, [records, query, view, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / RECORDS_PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * RECORDS_PAGE_SIZE, page * RECORDS_PAGE_SIZE);

  const resetFilters = () => { setQuery(''); setView('All'); setPage(1); };
  const openAdd = () => { setForm(EMPTY_RECORD); setShowAdd(true); };
  const openEdit = (r) => {
    setEditing(r);
    setForm({ name: r.name || '', dod: r.dod_raw || '', status: r.status || 'deceased', remarks: r.remarks || '' });
  };

  const buildPayload = () => {
    const name = form.name.trim();
    return {
      name,
      ...splitName(name),
      dod_raw: form.dod.trim() || null,
      dod_year: yearFromText(form.dod),
      status: form.status || 'deceased',
      remarks: form.remarks.trim() || null,
    };
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required.'); return; }
    setBusy(true);
    // source_file 'manual' keeps app-added rows out of the seed's idempotent wipe.
    const res = await addRecord({ ...buildPayload(), source_file: 'manual', needs_verification: false });
    setBusy(false);
    if (!res.ok) { toast.error('Database error: ' + res.error); return; }
    toast.success(`${form.name.trim()} added to the registry.`);
    setShowAdd(false);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required.'); return; }
    setBusy(true);
    const res = await updateRecord(editing.id, buildPayload());
    setBusy(false);
    if (!res.ok) { toast.error('Database error: ' + res.error); return; }
    setEditing(null);
    toast.success('Record updated.');
  };

  const confirmDelete = async () => {
    setBusy(true);
    const res = await removeRecord(deleting.id);
    setBusy(false);
    if (!res.ok) { toast.error('Database error: ' + res.error); return; }
    toast.success(`${deleting.name} removed.`);
    setDeleting(null);
  };

  // Pre-fill the "Show on map" modal: reuse the existing pin/route when this
  // person is already on the map, otherwise seed from the registry row.
  const openPublish = (r) => {
    const key = normalizeName(r.name);
    const existing = places.find((p) => normalizeName(p.name) === key);
    const existingRoute = ROUTES.find((rt) => normalizeName(rt.grave) === key);
    setPublishing(r);
    setPublishForm({
      name: r.name || '',
      section: existing && graveSection(existing) !== '—' ? graveSection(existing) : '',
      birthdate: existing?.birthdate ? toISODate(existing.birthdate) : '',
      dod: r.dod_raw || existing?.dod || (r.dod_date ? formatDodText(r.dod_date) : ''),
      x: existing?.x || '50%',
      y: existing?.y || '50%',
    });
    setPublishRoutePts(existingRoute?.waypoints ? existingRoute.waypoints.map((w) => ({ x: +w.x, y: +w.y })) : []);
  };

  const submitPublish = async (e) => {
    e.preventDefault();
    const name = publishForm.name.trim();
    if (!name) { toast.error('Name is required.'); return; }
    setPublishBusy(true);
    // Register the traced route first so the pin can snap to its last point.
    const hasRoute = publishRoutePts.length >= 2;
    if (hasRoute) addCustomRoutes([{ grave: name, entrance: 'entranceMain', waypoints: publishRoutePts }]);
    const lastPt = publishRoutePts.length > 0 ? publishRoutePts[publishRoutePts.length - 1] : null;
    const x = lastPt ? `${lastPt.x}%` : publishForm.x || '50%';
    const y = lastPt ? `${lastPt.y}%` : publishForm.y || '50%';
    // Section can be typed, or derived from where the pin/route lands on the map.
    let section = publishForm.section.trim();
    if (!section) {
      const derived = graveSection({ x, y });
      if (derived && derived !== '—') section = derived;
    }
    if (!section) {
      setPublishBusy(false);
      toast.error('Section is required — type one (e.g. S1) or move the pin/route inside a section.');
      return;
    }
    const payload = {
      name,
      section,
      level: 1,
      birthdate: publishForm.birthdate ? fromISODate(publishForm.birthdate) : null,
      dod: formatDodText(publishForm.dod),
      x,
      y,
    };
    const key = normalizeName(name);
    const existing = places.find((p) => normalizeName(p.name) === key);
    const res = existing ? await updateGrave(existing.id, payload) : await addGrave(payload);
    setPublishBusy(false);
    if (!res.ok) { toast.error('Database error: ' + res.error); return; }
    // Persist the walking-route waypoints for this grave.
    if (hasRoute && supabase) {
      const { error } = await supabase
        .from('custom_routes')
        .upsert({ grave: name, waypoints: publishRoutePts, entrance: 'entranceMain' }, { onConflict: 'grave' });
      if (error) toast.error('Saved on the map, but route save failed: ' + error.message);
    }
    toast.success(existing ? `${name} updated on the map.` : `${name} added to the map (Section ${section}).`);
    setPublishing(null);
    setPublishRoutePts([]);
  };

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
    const header = ['No.', 'Name', 'Surname', 'Given name', 'Date of death', 'Year', 'Status', 'Needs verification', 'Remarks'];
    const lines = rows.map((r) =>
      [csvEscape(r.record_no), csvEscape(r.name), csvEscape(r.surname), csvEscape(r.given_name), csvEscape(r.dod_raw), csvEscape(r.dod_year), csvEscape(r.status), csvEscape(r.needs_verification), csvEscape(r.remarks)].join(',')
    );
    downloadFile(`deceased-registry-${new Date().toISOString().slice(0, 10)}.csv`, [header.join(','), ...lines].join('\n'));
    toast.success(`${rows.length} record${rows.length === 1 ? '' : 's'} exported.`);
  };

  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Popup blocked — allow popups to print.'); return; }
    w.document.write(`<!doctype html><html><head><title>Cemetery Registry Report</title>
      <style>body{font-family:Georgia,serif;padding:32px;color:#222}h1{margin-bottom:4px}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px}th{background:#0f2a20;color:#fff}</style></head><body>
      <h1>Agnipa Memorial Park — Deceased Registry</h1>
      <p>Generated ${new Date().toLocaleString()}</p>
      <p>Showing <b>${rows.length}</b> of <b>${counts.total}</b> · Deceased: <b>${counts.deceased}</b> · Reserved: <b>${counts.reserved}</b> · Needs verification: <b>${counts.needsVerification}</b></p>
      <table><thead><tr><th>Name</th><th>Date of death</th><th>Year</th><th>Status</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${r.name}</td><td>${r.dod_raw || '—'}</td><td>${r.dod_year || '—'}</td><td>${r.status}</td></tr>`).join('')}
      </tbody></table>
      <script>window.print();</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <div className="card"><div className="kicker">Total records</div><div className="serif" style={{ fontSize: 36 }}>{counts.total}</div></div>
        <div className="card"><div className="kicker">Deceased</div><div className="serif" style={{ fontSize: 36 }}>{counts.deceased}</div></div>
        <div className="card"><div className="kicker">Reserved</div><div className="serif" style={{ fontSize: 36 }}>{counts.reserved}</div></div>
        <div className="card"><div className="kicker">Needs verification</div><div className="serif" style={{ fontSize: 36 }}>{counts.needsVerification}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="kicker">Park registry · public.deceased</div>
        <h3 className="serif" style={{ margin: '4px 0 8px' }}>Record of the deceased</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 12px' }}>
          <span className={`status-dot ${databaseConnected ? 'on' : 'off'}`} />
          {databaseConnected
            ? `Live records from the park registry · ${counts.total} records imported from the ledger.`
            : 'Registry offline — run supabase-deceased.sql in Supabase to load the 489 records.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-green btn-sm" onClick={exportCsv}>⬇ Export CSV (current view)</button>
          <button className="btn btn-accent btn-sm" onClick={printReport}>🖨 Print report</button>
        </div>
      </div>

      <div className="toolbar-row">
        <input className="input" style={{ maxWidth: 280 }} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search name…" />
        <select className="select" style={{ maxWidth: 200 }} value={view} onChange={(e) => { setView(e.target.value); setPage(1); }}>
          <option value="All">All records</option>
          <option value="deceased">Deceased only</option>
          <option value="reserved">Reserved only</option>
          <option value="needs_verification">Needs verification</option>
        </select>
        <select className="select" style={{ maxWidth: 190 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="year-new">Year (newest)</option>
          <option value="year-old">Year (oldest)</option>
          <option value="flag">Needs verification first</option>
        </select>
        <button className="btn btn-light btn-sm" onClick={resetFilters}>Reset</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-light btn-sm" onClick={refresh}>↻ Refresh</button>
        <button className="btn btn-green btn-sm" onClick={openAdd}>+ Add Record</button>
      </div>

      {dbError && <p className="error-text">Database: {dbError}</p>}
      {loading ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : rows.length === 0 ? (
        <div className="card"><EmptyState title="No records match" hint="Adjust your search, or add a new record." /></div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr><th></th><th>Name</th><th>Date of death</th><th>Year</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id}>
                    <td>{photoForName(r.name) ? <img className="row-thumb" src={photoForName(r.name)} alt="" /> : <span>✝</span>}</td>
                    <td><b>{r.name}</b>{r.given_name ? <span style={{ color: 'var(--muted)' }}> · {r.given_name}</span> : null}</td>
                    <td>
                      {r.dod_raw || '—'}
                      {r.needs_verification ? <span className="pill" title={r.remarks || 'Needs verification'} style={{ marginLeft: 6 }}>⚠️ verify</span> : null}
                    </td>
                    <td>{r.dod_year || '—'}</td>
                    <td><span className="pill">{r.status}</span></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        className="btn btn-gold btn-sm"
                        onClick={() => openPublish(r)}
                        style={{ marginRight: 6 }}
                        title="Update this record's info and route, then place it on the map graves"
                      >
                        Show on map
                      </button>
                      <button className="btn btn-accent btn-sm" onClick={() => openEdit(r)} style={{ marginRight: 6 }}>Edit</button>
                      <button className="btn btn-red btn-sm" onClick={() => setDeleting(r)}>Delete</button>
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

      {showAdd && (
        <Modal title="Add record" onClose={() => setShowAdd(false)}>
          <RecordEditor form={form} setForm={setForm} onSubmit={submitAdd} busy={busy} submitLabel="Add Record" onCancel={() => setShowAdd(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={`Edit — ${editing.name}`} onClose={() => setEditing(null)}>
          <RecordEditor form={form} setForm={setForm} onSubmit={submitEdit} busy={busy} submitLabel="Save Changes" onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {publishing && (
        <Modal
          title={`Show on map — ${publishing.name}`}
          onClose={() => { setPublishing(null); setPublishRoutePts([]); }}
        >
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 12px' }}>
            {(() => {
              const already = places.some((p) => normalizeName(p.name) === normalizeName(publishing.name));
              return already
                ? 'This person is already on the map — saving will update their info, pin, and route.'
                : 'Copy this record to the map graves: check the details, trace the walking route, and it appears on Find a Grave.';
            })()}
          </p>
          <form onSubmit={submitPublish}>
            <div className="form-grid">
              <div>
                <label className="field">Full name *</label>
                <input
                  className="input"
                  value={publishForm.name}
                  onChange={(e) => setPublishForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="field">Section * (e.g. S1)</label>
                <input
                  className="input"
                  list="publish-sections"
                  value={publishForm.section}
                  onChange={(e) => setPublishForm((f) => ({ ...f, section: e.target.value }))}
                  placeholder="Leave blank to derive from the pin"
                />
                <datalist id="publish-sections">
                  {INITIAL_MAP_SECTIONS.map((s) => <option key={s.id} value={s.id} />)}
                </datalist>
              </div>
              <div>
                <label className="field">Birthdate</label>
                <input
                  className="input"
                  type="date"
                  value={publishForm.birthdate}
                  onChange={(e) => setPublishForm((f) => ({ ...f, birthdate: e.target.value }))}
                />
              </div>
              <div>
                <label className="field">Date of death (from registry)</label>
                <input
                  className="input"
                  value={publishForm.dod}
                  onChange={(e) => setPublishForm((f) => ({ ...f, dod: e.target.value }))}
                  placeholder="e.g. 2/5/2012 or DIED 2007"
                />
              </div>
              <div>
                <label className="field">Pin X (%)</label>
                <input
                  className="input"
                  value={publishForm.x}
                  onChange={(e) => setPublishForm((f) => ({ ...f, x: e.target.value }))}
                />
              </div>
              <div>
                <label className="field">Pin Y (%)</label>
                <input
                  className="input"
                  value={publishForm.y}
                  onChange={(e) => setPublishForm((f) => ({ ...f, y: e.target.value }))}
                />
              </div>
            </div>
            <RouteTracer
              points={publishRoutePts}
              onChange={setPublishRoutePts}
              label="Walking route (optional — the last point becomes the pin)"
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" className="btn btn-light" onClick={() => { setPublishing(null); setPublishRoutePts([]); }}>Cancel</button>
              <button type="submit" className="btn btn-green" disabled={publishBusy}>
                {publishBusy ? 'Saving…' : 'Save to map'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Remove this record?" onClose={() => setDeleting(null)}>
          <p>Permanently remove <b>{deleting.name}</b> from the registry? This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-light" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn btn-red" disabled={busy} onClick={confirmDelete}>{busy ? 'Removing…' : 'Yes, Remove'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function RecordEditor({ form, setForm, onSubmit, busy, submitLabel, onCancel }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <form onSubmit={onSubmit}>
      <div className="form-grid">
        <div>
          <label className="field">Full name *</label>
          <input className="input" value={form.name} onChange={set('name')} placeholder="SURNAME, FIRSTNAME" />
        </div>
        <div>
          <label className="field">Date of death</label>
          <input className="input" value={form.dod} onChange={set('dod')} placeholder="e.g. 3/8/2022 or DIED 2000" />
        </div>
        <div>
          <label className="field">Status</label>
          <select className="input" value={form.status} onChange={set('status')}>
            <option value="deceased">Deceased</option>
            <option value="reserved">Reserved</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div>
          <label className="field">Remarks</label>
          <input className="input" value={form.remarks} onChange={set('remarks')} placeholder="Optional note" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn btn-light" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-green" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}

// ---- Visitor survey results ------------------------------------------------
function SurveyPanel() {
  const { responses, loading, dbError, databaseConnected, refresh, removeResponse } = useSurvey();
  const toast = useToast();
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(
    () =>
      SURVEY_QUESTIONS.map((text, i) => ({
        no: i + 1,
        text,
        ...computeWeightedMean(responses, i + 1),
      })),
    [responses]
  );

  const answeredStats = stats.filter((s) => s.n > 0);
  const overallMean = answeredStats.length
    ? answeredStats.reduce((sum, s) => sum + s.mean, 0) / answeredStats.length
    : 0;
  const best = answeredStats.length
    ? answeredStats.reduce((a, b) => (b.mean > a.mean ? b : a))
    : null;

  // Submitted rows vs rows that actually carry answers. N (the weighted-mean
  // denominator) uses the latter, so a mismatch means some responses were
  // saved without their answers.
  const answered = answeredCount(responses);
  const incomplete = responses.filter((r) => !isAnswered(r));

  const removeIncomplete = async () => {
    if (!incomplete.length) return;
    setBusy(true);
    for (const r of incomplete) {
      const res = await removeResponse(r.id);
      if (!res.ok) {
        setBusy(false);
        toast.error('Could not remove response: ' + res.error);
        return;
      }
    }
    setBusy(false);
    toast.success(`${incomplete.length} incomplete response${incomplete.length === 1 ? '' : 's'} removed.`);
  };

  const respondentMean = (r) => {
    const vals = SURVEY_QUESTIONS.map((_, i) => Number(r.answers?.[i + 1])).filter(Boolean);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const confirmDelete = async () => {
    setBusy(true);
    const res = await removeResponse(deleting.id);
    setBusy(false);
    if (!res.ok) { toast.error('Database error: ' + res.error); return; }
    toast.success(`Response from ${deleting.name} removed.`);
    setDeleting(null);
  };

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
    const itemMeans = answeredStats.map((s) => s.mean);
    const totalFw = stats.reduce((sum, s) => sum + s.sumFw, 0);
    const totalN = stats.reduce((sum, s) => sum + s.n, 0);
    const pooledMean = totalN ? totalFw / totalN : 0;

    // Every cell is quoted so commas in statements and formulas stay intact.
    const row = (...cells) => cells.map(csvEscape).join(',');
    const lines = [];

    lines.push(row('Agnipa Memorial Park - Visitor Survey Results'));
    lines.push(row('Generated', new Date().toLocaleString()));
    lines.push(row('Total responses', responses.length));
    lines.push(row('N (answered)', answered));
    lines.push(row('Formula', 'x̄ = Σ(f·w) / N'));
    lines.push(row('f', 'Frequency (number of respondents who chose an option)'));
    lines.push(row('w', 'Weight (Strongly Agree = 5, Agree = 4, Moderately Agree = 3, Disagree = 2, Strongly Disagree = 1)'));
    lines.push(row('N', 'Total responses to the statement (N = Σf)'));
    lines.push(row('Interpretation bands', '4.21-5.00 Strongly Agree; 3.41-4.20 Agree; 2.61-3.40 Moderately Agree; 1.81-2.60 Disagree; 1.00-1.80 Strongly Disagree'));
    lines.push('');

    lines.push(row('SUMMARY OF WEIGHTED MEANS'));
    lines.push(row('Section', 'Question #', 'Statement', 'N', 'Σ(f·w)', 'x̄', 'Interpretation'));
    for (const section of SURVEY_SECTIONS) {
      for (const no of section.questionNos) {
        const s = stats.find((x) => x.no === no);
        if (!s) continue;
        lines.push(row(
          section.title,
          s.no,
          s.text,
          s.n,
          s.sumFw,
          s.n ? s.mean.toFixed(2) : '',
          s.n ? s.interpretation.label : 'No responses'
        ));
      }
    }
    lines.push('');

    lines.push(row('COMPUTATION PER STATEMENT'));
    lines.push(row(
      'Section',
      'Question #',
      'Statement',
      'Response option',
      'Weight (w)',
      'Frequency (f)',
      'f · w',
      'N',
      'Σ(f·w)',
      'x̄',
      'Interpretation',
      'Computation'
    ));
    for (const section of SURVEY_SECTIONS) {
      for (const no of section.questionNos) {
        const s = stats.find((x) => x.no === no);
        if (!s) continue;
        for (const o of LIKERT_OPTIONS) {
          lines.push(row(
            section.title,
            s.no,
            s.text,
            o.label,
            o.value,
            s.counts[o.value],
            s.counts[o.value] * o.value
          ));
        }
        lines.push(row(
          section.title,
          s.no,
          s.text,
          'Total',
          '',
          `N = ${s.n}`,
          `Σ(f·w) = ${s.sumFw}`,
          s.n,
          s.sumFw,
          s.n ? s.mean.toFixed(2) : '',
          s.n ? s.interpretation.label : 'No responses',
          s.n ? `x̄ = Σ(f·w) / N = ${s.sumFw} / ${s.n} = ${s.mean.toFixed(2)}` : 'No responses'
        ));
      }
    }
    lines.push('');

    lines.push(row('OVERALL RESULT'));
    lines.push(row('Metric', 'Value', 'Computation'));
    lines.push(row(
      'Overall weighted mean (mean of item means)',
      overallMean ? overallMean.toFixed(2) : '',
      itemMeans.length
        ? `(${itemMeans.map((m) => m.toFixed(2)).join(' + ')}) / ${itemMeans.length} = ${overallMean.toFixed(2)}`
        : 'No responses'
    ));
    lines.push(row(
      'Pooled weighted mean (all answers)',
      totalN ? pooledMean.toFixed(2) : '',
      totalN
        ? `Σ(all f·w) / ΣN = ${totalFw} / ${totalN} = ${pooledMean.toFixed(2)}`
        : 'No responses'
    ));
    lines.push('');

    lines.push(row('INDIVIDUAL RESPONSES'));
    lines.push(row(
      'Name',
      'Email',
      'Consent',
      'Submitted',
      ...RESPONDENT_PROFILE_COLUMNS.map((c) => c.label),
      ...SURVEY_QUESTIONS.map((_, i) => `Q${i + 1}`),
      'Average'
    ));
    for (const r of responses) {
      lines.push(row(
        r.name,
        r.email,
        r.consent,
        new Date(r.created_at).toLocaleString(),
        ...RESPONDENT_PROFILE_COLUMNS.map((c) => r.profile?.[c.key] ?? ''),
        ...SURVEY_QUESTIONS.map((_, i) => r.answers?.[i + 1] ?? ''),
        respondentMean(r).toFixed(2)
      ));
    }

    downloadFile(
      `survey-results-${new Date().toISOString().slice(0, 10)}.csv`,
      // BOM keeps x̄, Σ, and the en dashes readable when opened in Excel.
      `\uFEFF${lines.join('\n')}`
    );
    toast.success('Survey results and weighted-mean computation exported.');
  };

  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Popup blocked — allow popups to print.'); return; }

    // Worked computation for every statement: option -> weight (w),
    // frequency (f), and f·w. The per-question weighted mean is the sum of
    // those products divided by N (the total number of responses to it).
    const totalFw = stats.reduce((sum, s) => sum + s.sumFw, 0);
    const totalN = stats.reduce((sum, s) => sum + s.n, 0);
    const pooledMean = totalN ? totalFw / totalN : 0;
    const itemMeans = answeredStats.map((s) => s.mean);

    const optionRows = (s) => LIKERT_OPTIONS.map((o) => `
      <tr>
        <td>${o.label}</td>
        <td class="num">${o.value}</td>
        <td class="num">${s.counts[o.value]}</td>
        <td class="num">${s.counts[o.value] * o.value}</td>
      </tr>`).join('');

    const computationBlocks = SURVEY_SECTIONS.map((section) => `
      <h2>${section.title}</h2>
      <p class="muted">${section.text}</p>
      ${section.questionNos.map((no) => {
        const s = stats.find((x) => x.no === no);
        if (!s) return '';
        return `
          <div class="question">
            <h3>${s.no}. ${s.text}</h3>
            <table>
              <thead><tr><th>Response option</th><th class="num">Weight (w)</th><th class="num">Frequency (f)</th><th class="num">f · w</th></tr></thead>
              <tbody>
                ${optionRows(s)}
                <tr class="total"><td>Total</td><td class="num">—</td><td class="num">N = ${s.n}</td><td class="num">Σ(f·w) = ${s.sumFw}</td></tr>
              </tbody>
            </table>
            <p class="calc">x̄ = Σ(f·w) ⁄ N = ${s.sumFw} ⁄ ${s.n} = <b>${s.n ? s.mean.toFixed(2) : '—'}</b>${s.n ? ` — ${s.interpretation.label}` : ''}</p>
          </div>`;
      }).join('')}
    `).join('');

    w.document.write(`<!doctype html><html><head><title>Survey Results Report</title>
      <style>
        body{font-family:Georgia,serif;padding:32px;color:#222;line-height:1.5}
        h1{margin:0 0 4px}
        h2{font-size:19px;margin:26px 0 4px;padding-top:14px;border-top:1px solid #ddd}
        h3{font-size:15px;margin:18px 0 8px}
        p{margin:4px 0}
        .muted{color:#666;font-size:13px}
        .calc{background:#faf7ef;border:1px solid #e5dfcf;border-radius:6px;padding:8px 12px;font-size:13.5px;margin-top:8px}
        table{border-collapse:collapse;width:100%;margin-top:10px}
        th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px}
        th{background:#0f2a20;color:#fff}
        .num{text-align:right;white-space:nowrap}
        .total td{font-weight:700;background:#faf7ef}
        .question{page-break-inside:avoid}
        .note{font-size:12px;color:#666;margin-top:6px}
      </style></head><body>
      <h1>Agnipa Memorial Park — Visitor Survey Results</h1>
      <p>Generated ${new Date().toLocaleString()} · Total responses: <b>${responses.length}</b> · N (answered) = <b>${answered}</b></p>

      <h2>How the weighted mean is computed</h2>
      <p class="calc"><b>x̄ = Σ(f·w) ⁄ N</b></p>
      <p class="muted">
        <b>f</b> = frequency (number of respondents who chose an option) ·
        <b>w</b> = weight of that option (Strongly Agree = 5, Agree = 4, Moderately Agree = 3, Disagree = 2, Strongly Disagree = 1) ·
        <b>N</b> = total responses to the statement (N = Σf).
      </p>
      <p class="muted">
        For each statement, multiply every option's frequency by its weight, add the products to get Σ(f·w), then divide by N.
        The result is interpreted using the standard five-point bands (4.21–5.00 Strongly Agree, 3.41–4.20 Agree,
        2.61–3.40 Moderately Agree, 1.81–2.60 Disagree, 1.00–1.80 Strongly Disagree).
      </p>

      <h2>Summary of weighted means</h2>
      <table>
        <thead><tr><th>#</th><th>Statement</th><th class="num">N</th><th class="num">Σ(f·w)</th><th class="num">x̄</th><th>Interpretation</th></tr></thead>
        <tbody>
          ${stats.map((s) => `<tr><td>${s.no}</td><td>${s.text}</td><td class="num">${s.n}</td><td class="num">${s.sumFw}</td><td class="num">${s.n ? s.mean.toFixed(2) : '—'}</td><td>${s.n ? s.interpretation.label : 'No responses'}</td></tr>`).join('')}
        </tbody>
      </table>

      <h2>Computation per statement</h2>
      ${computationBlocks}

      <h2>Overall result</h2>
      <p class="calc">
        Overall weighted mean (mean of the ${itemMeans.length} item means):
        x̄ = (${itemMeans.map((m) => m.toFixed(2)).join(' + ') || '—'}) ⁄ ${itemMeans.length || '—'} =
        <b>${overallMean ? overallMean.toFixed(2) : '—'}</b>
        ${overallMean ? ` — ${interpretMean(overallMean).label}` : ''}
      </p>
      <p class="note">
        Pooled check across all answers: Σ(all f·w) ⁄ ΣN = ${totalFw} ⁄ ${totalN} = ${totalN ? pooledMean.toFixed(2) : '—'}.
        The overall weighted mean above is the average of the per-statement weighted means, which gives each statement equal weight.
      </p>
      <script>window.print();</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <div className="card">
          <div className="kicker">Responses</div>
          <div className="serif" style={{ fontSize: 36 }}>{responses.length}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>N (answered) = {answered}</div>
        </div>
        <div className="card"><div className="kicker">Overall weighted mean</div><div className="serif" style={{ fontSize: 36 }}>{overallMean ? overallMean.toFixed(2) : '—'}</div></div>
        <div className="card">
          <div className="kicker">Highest-rated item</div>
          <div style={{ fontWeight: 700 }}>{best ? `Q${best.no} · ${best.mean.toFixed(2)}` : '—'}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>{best ? best.interpretation.label : ''}</div>
        </div>
        <div className="card">
          <div className="kicker">Source</div>
          <div className="serif" style={{ fontSize: 22 }}><span className={`status-dot ${databaseConnected ? 'on' : 'off'}`} />{databaseConnected ? 'Live database' : 'Local browser'}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="kicker">Survey results</div>
        <h3 className="serif" style={{ margin: '4px 0 8px' }}>Weighted mean per question</h3>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 8px' }}>
          <span className={`status-dot ${databaseConnected ? 'on' : 'off'}`} />
          {databaseConnected
            ? `Live responses from public.survey_responses · ${responses.length} submitted · ${answered} counted in N.`
            : 'Offline mode — responses saved in this browser. Run supabase-survey.sql to collect them in the database.'}
        </p>
        <p className="wmean-formula">
          Formula: x̄ = Σ(f·w) ⁄ N — f = frequency of each option, w = its weight (Strongly Agree = 5, Agree = 4, Moderately Agree = 3, Disagree = 2, Strongly Disagree = 1), N = total responses.
        </p>

        {answeredStats.length > 0 && (() => {
          const example = answeredStats[0];
          return (
            <details className="wmean-worked">
              <summary>Show how the weighted mean is computed (worked example: Q{example.no})</summary>
              <p className="wmean-formula">
                Multiply each option's frequency (f) by its weight (w), add the products to get
                Σ(f·w), then divide by N (the number of respondents who answered this statement).
              </p>
              <div className="table-wrap">
                <table className="records" style={{ minWidth: 0 }}>
                  <thead>
                    <tr><th>Response option</th><th>Weight (w)</th><th>Frequency (f)</th><th>f · w</th></tr>
                  </thead>
                  <tbody>
                    {LIKERT_OPTIONS.map((o) => (
                      <tr key={o.value}>
                        <td>{o.label}</td>
                        <td>{o.value}</td>
                        <td>{example.counts[o.value]}</td>
                        <td>{example.counts[o.value] * o.value}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700, background: '#faf7ef' }}>
                      <td>Total</td>
                      <td>—</td>
                      <td>N = {example.n}</td>
                      <td>Σ(f·w) = {example.sumFw}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="wmean-formula">
                x̄ = Σ(f·w) ⁄ N = {example.sumFw} ⁄ {example.n} ={' '}
                <b>{example.mean.toFixed(2)}</b> — {example.interpretation.label}
              </p>
              <p className="wmean-formula">
                The overall weighted mean is the average of the {answeredStats.length} item means:
                x̄ = ({answeredStats.map((s) => s.mean.toFixed(2)).join(' + ')}) ⁄ {answeredStats.length} ={' '}
                <b>{overallMean.toFixed(2)}</b>.
              </p>
            </details>
          );
        })()}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn btn-green btn-sm" onClick={exportCsv}>⬇ Export CSV (results + computation)</button>
          <button className="btn btn-accent btn-sm" onClick={printReport}>🖨 Print report</button>
          <button className="btn btn-light btn-sm" onClick={refresh}>↻ Refresh</button>
        </div>
      </div>

      {dbError && <p className="error-text">Database: {dbError}</p>}

      {incomplete.length > 0 && (
        <div className="card" style={{ marginBottom: 22, borderLeft: '4px solid #e08e3c' }}>
          <div className="kicker">Incomplete responses</div>
          <p style={{ margin: '4px 0 10px', fontSize: 14 }}>
            <b>{incomplete.length}</b> of {responses.length} submitted response{incomplete.length === 1 ? '' : 's'}{' '}
            {incomplete.length === 1 ? 'was' : 'were'} saved without answers, so {incomplete.length === 1 ? 'it is' : 'they are'}{' '}
            counted in the response total but excluded from N (the weighted-mean denominator).
          </p>
          <div className="table-wrap">
            <table className="records" style={{ minWidth: 0 }}>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Submitted</th><th>Answers</th></tr>
              </thead>
              <tbody>
                {incomplete.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.name}</b></td>
                    <td>{r.email}</td>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                    <td>none</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button className="btn btn-red btn-sm" onClick={removeIncomplete} disabled={busy}>
              {busy ? 'Removing…' : `Remove ${incomplete.length} incomplete response${incomplete.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : responses.length === 0 ? (
        <div className="card">
          <EmptyState icon="📊" title="No survey responses yet" hint="Responses will appear here once visitors complete the survey." />
        </div>
      ) : (
        <>
          {SURVEY_SECTIONS.map((section) => (
            <div key={section.key} className="survey-result-section">
              <div className="survey-section-head" style={{ marginTop: 22 }}>
                <div className="kicker">{section.characteristic}</div>
                <h3 className="serif">{section.title}</h3>
                <p>{section.text}</p>
              </div>
              {section.questionNos
                .map((no) => stats.find((s) => s.no === no))
                .filter(Boolean)
                .map((s) => (
            <div className="card" key={s.no} style={{ marginBottom: 16 }}>
              <div className="kicker">Question {s.no} of {SURVEY_QUESTIONS.length}</div>
              <h3 className="serif" style={{ margin: '4px 0 14px', fontSize: 19 }}>{s.text}</h3>

              <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ minWidth: 160 }}>
                  <div className="wmean-badge">{s.mean ? s.mean.toFixed(2) : '—'} <small>/ 5.00</small></div>
                  <div className="wmean-formula">{s.interpretation.label} · N = {s.n}</div>
                  {s.n !== responses.length && (
                    <div className="wmean-formula" style={{ color: '#b3372a' }}>
                      {responses.length - s.n} response{responses.length - s.n === 1 ? '' : 's'} without an
                      answer excluded from N
                    </div>
                  )}
                </div>
                <div style={{ flex: '1 1 240px' }}>
                  <div className="dist-bar">
                    {LIKERT_OPTIONS.map((o) => (
                      <span
                        key={o.value}
                        style={{ width: `${s.n ? (s.counts[o.value] / s.n) * 100 : 0}%`, background: o.color }}
                        title={`${o.label}: ${s.counts[o.value]}`}
                      />
                    ))}
                  </div>
                  <div className="dist-legend">
                    {LIKERT_OPTIONS.map((o) => (
                      <span key={o.value}><i style={{ background: o.color }} />{o.label} · {s.counts[o.value]}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="table-wrap">
                <table className="records" style={{ minWidth: 0 }}>
                  <thead>
                    <tr><th>Response option</th><th>Weight (w)</th><th>Frequency (f)</th><th>f · w</th></tr>
                  </thead>
                  <tbody>
                    {LIKERT_OPTIONS.map((o) => (
                      <tr key={o.value}>
                        <td>{o.label}</td>
                        <td>{o.value}</td>
                        <td>{s.counts[o.value]}</td>
                        <td>{s.counts[o.value] * o.value}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700, background: '#faf7ef' }}>
                      <td>Total</td>
                      <td>—</td>
                      <td>N = {s.n}</td>
                      <td>Σ(f·w) = {s.sumFw}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="wmean-formula" style={{ marginTop: 10 }}>
                x̄ = Σ(f·w) ⁄ N = {s.sumFw} ⁄ {s.n} = <b>{s.n ? s.mean.toFixed(2) : '—'}</b>
              </p>
            </div>
                ))}
            </div>
          ))}

          <div className="card" style={{ marginTop: 22 }}>
            <div className="kicker">Individual responses</div>
            <h3 className="serif" style={{ margin: '4px 0 12px' }}>Respondent list</h3>
            <div className="table-wrap">
              <table className="records" style={{ minWidth: 940 }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Profile</th>
                    <th>Submitted</th>
                    {SURVEY_QUESTIONS.map((_, i) => <th key={i}>Q{i + 1}</th>)}
                    <th>x̄</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.name}</b></td>
                      <td>{r.email}</td>
                      <td style={{ fontSize: 12.5, lineHeight: 1.55, minWidth: 150 }}>
                        {RESPONDENT_PROFILE_COLUMNS.filter((c) => r.profile?.[c.key]).length === 0
                          ? '—'
                          : RESPONDENT_PROFILE_COLUMNS.map((c) =>
                              r.profile?.[c.key] ? (
                                <div key={c.key}><b>{c.label}:</b> {r.profile[c.key]}</div>
                              ) : null
                            )}
                      </td>
                      <td>{new Date(r.created_at).toLocaleString()}</td>
                      {SURVEY_QUESTIONS.map((_, i) => <td key={i}>{r.answers?.[i + 1] ?? '—'}</td>)}
                      <td>{respondentMean(r).toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-red btn-sm" onClick={() => setDeleting(r)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {deleting && (
        <Modal title="Remove this response?" onClose={() => setDeleting(null)}>
          <p>Permanently remove the survey response from <b>{deleting.name}</b> ({deleting.email})? This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-light" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn btn-red" disabled={busy} onClick={confirmDelete}>{busy ? 'Removing…' : 'Yes, Remove'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---- Map graves & walking routes (public.graves) ---------------------------
function GravesPanel({ email }) {
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
    const lastPtAdd = routePts.length > 0 ? routePts[routePts.length - 1] : null;
    const res = await addGrave({ name: form.name.trim(), section: form.section.trim(), level: 1, birthdate: form.birthdate ? fromISODate(form.birthdate) : null, dod: form.dod ? fromISODate(form.dod) : null, x: lastPtAdd ? `${lastPtAdd.x}%` : form.x || '50%', y: lastPtAdd ? `${lastPtAdd.y}%` : form.y || '50%' });
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
    // The pin locator sits at the last marked route point when a route was
    // traced; otherwise keep the manually entered X/Y.
    const lastPt = routePts.length > 0 ? routePts[routePts.length - 1] : null;
    const pinX = lastPt ? `${lastPt.x}%` : form.x || '50%';
    const pinY = lastPt ? `${lastPt.y}%` : form.y || '50%';
    const res = await updateGrave(editing.id, { name: form.name.trim(), section: form.section.trim(), birthdate: form.birthdate ? fromISODate(form.birthdate) : null, dod: form.dod ? fromISODate(form.dod) : null, x: pinX, y: pinY });
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
      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <div className="card"><div className="kicker">Mapped graves</div><div className="serif" style={{ fontSize: 36 }}>{places.length}</div></div>
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
