import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGraves } from '../graves.jsx';
import { photoForName, INITIAL_MAP_SECTIONS, graveSection } from '../data.js';
import { SectionHead } from '../ui.jsx';
import agnipaPhoto from '../../assets/Agnipa.jpg';

export default function Home() {
  const { places, databaseConnected } = useGraves();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const sections = useMemo(
    () => [...new Set(places.map((p) => graveSection(p)).filter(Boolean))],
    [places]
  );
  const featured = useMemo(() => places.slice(0, 4), [places]);

  const goSearch = (e) => {
    e?.preventDefault();
    navigate(query.trim() ? `/find?name=${encodeURIComponent(query.trim())}` : '/find');
  };

  return (
    <>
      <section className="hero">
        <img className="hero-bg" src={agnipaPhoto} alt="Agnipa Memorial Park" />
        <div className="hero-overlay" />
        <div className="container hero-content">
          <span className="eyebrow">Agnipa · Romblon · Philippines</span>
          <h1>Find your loved ones, guided every step of the way.</h1>
          <p className="lead">
            Search grave records, view photos, and follow a marked route from the main
            entrance — right here in your browser, no app install needed.
          </p>
          <form className="hero-search" onSubmit={goSearch}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a name — e.g. Juan Dela Cruz"
              aria-label="Search grave name"
            />
            <button className="btn btn-gold" type="submit">Search</button>
          </form>
          <div className="hero-actions">
            <Link className="btn btn-ghost" to="/find">Open Cemetery Map</Link>
            <Link className="btn btn-ghost" to="/services">Hours & Services</Link>
          </div>
        </div>
      </section>

      <div className="stat-band">
        <div className="container stat-grid">
          <div className="stat">
            <div className="num">{places.length}</div>
            <div className="lbl">Grave Records</div>
          </div>
          <div className="stat">
            <div className="num">{sections.length}</div>
            <div className="lbl">Sections</div>
          </div>
          <div className="stat">
            <div className="num">3</div>
            <div className="lbl">Entrances</div>
          </div>
          <div className="stat">
            <div className="num">{databaseConnected ? 'Live' : 'Local'}</div>
            <div className="lbl">Records Status</div>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <SectionHead
            kicker="How it works"
            title="Three steps to the gravesite"
            text="Designed for visitors of all ages — large markers, clear routes, and photos for easy recognition."
          />
          <div className="grid grid-3">
            <div className="card hover">
              <div className="card-icon">🔍</div>
              <h3>1. Search a name</h3>
              <p>Type the full name of your loved one. Matching markers light up on the cemetery map instantly.</p>
            </div>
            <div className="card hover">
              <div className="card-icon">🗺️</div>
              <h3>2. Follow the route</h3>
              <p>A golden path is drawn from the Main Entrance straight to the gravesite marker.</p>
            </div>
            <div className="card hover">
              <div className="card-icon">🖼️</div>
              <h3>3. Confirm by photo</h3>
              <p>Each record shows a memorial photo so you can confirm you are at the right resting place.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <SectionHead
            kicker="In remembrance"
            title="Recently remembered"
            text="A glimpse of the memorial records kept by the park."
          />
          <div className="grid grid-4">
            {featured.map((p) => (
              <Link
                key={p.id}
                to={`/grave/${p.id}`}
                className="card hover grave-card"
                style={{ textDecoration: 'none' }}
              >
                {photoForName(p.name) && <img src={photoForName(p.name)} alt={p.name} loading="lazy" />}
                <div className="body">
                  <span className="pill">Section {graveSection(p)}</span>
                  <h3>{p.name}</h3>
                  <div className="meta">{p.dod ? `† ${p.dod}` : 'Rest in peace'}</div>
                </div>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 22 }}>
            <Link className="btn btn-pine" to="/find">Browse all records</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead
            kicker="Park layout"
            title="Cemetery sections"
            text="The park is divided into lettered sections. Tap a section to explore its graves on the map."
          />
          <div className="grid grid-4">
            {INITIAL_MAP_SECTIONS.map((s) => {
              const count = places.filter((p) => graveSection(p) === s.id).length;
              return (
                <Link
                  key={s.id}
                  to={`/find?section=${encodeURIComponent(s.id)}`}
                  className="card hover"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="card-icon">{s.id}</div>
                  <h3>Section {s.label}</h3>
                  <p>{count} recorded grave{count === 1 ? '' : 's'}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <div className="card" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 280px' }}>
              <div className="kicker">Plan your visit</div>
              <h2 style={{ margin: '8px 0 10px' }}>Open daily, 6:00 AM – 6:00 PM</h2>
              <p style={{ color: 'var(--muted)', margin: '0 0 18px', lineHeight: 1.65 }}>
                See burial services, maintenance, visiting hours, and park rules before you come.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="btn btn-pine" to="/services">View services</Link>
                <Link className="btn btn-light" to="/contact">Contact the office</Link>
              </div>
            </div>
            <div style={{ fontSize: 90, lineHeight: 1 }}>🕊️</div>
          </div>
        </div>
      </section>
    </>
  );
}
