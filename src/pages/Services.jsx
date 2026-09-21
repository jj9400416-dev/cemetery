import { Link } from 'react-router-dom';
import { PageHero, SectionHead } from '../ui.jsx';

export default function Services() {
  return (
    <>
      <PageHero
        eyebrow="Services & visiting"
        title="How we help your family."
        subtitle="Burial plots, memorial care, and visiting information — all in one place."
      />
      <section className="section">
        <div className="container">
          <SectionHead kicker="What we offer" title="Park services" />
          <div className="grid grid-3">
            <div className="card hover"><div className="card-icon">⚰️</div><h3>Burial Plots</h3><p>New plots across sections A–E with recorded coordinates, so the gravesite is always findable on the map.</p></div>
            <div className="card hover"><div className="card-icon">🪦</div><h3>Memorial Records</h3><p>Names, dates, and photos kept in the park registry and published here for family members near and far.</p></div>
            <div className="card hover"><div className="card-icon">🌿</div><h3>Grounds Care</h3><p>Regular grass cutting, pathway upkeep, and marker cleaning to keep every section peaceful and walkable.</p></div>
            <div className="card hover"><div className="card-icon">🕯️</div><h3>Vigils & Ceremonies</h3><p>Space and assistance for wakes, blessings, and Undas gatherings. Coordinate with the office for scheduling.</p></div>
            <div className="card hover"><div className="card-icon">🔍</div><h3>Grave Locating</h3><p>Can't find a marker? Staff will help locate it on the map — or send a search link before your visit.</p></div>
            <div className="card hover"><div className="card-icon">📝</div><h3>Record Updates</h3><p>Corrections to names, dates, or photos are applied by staff after verification. Just contact us.</p></div>
          </div>
        </div>
      </section>
      <section className="section alt">
        <div className="container grid grid-2">
          <div className="card">
            <SectionHead kicker="Plan ahead" title="Visiting hours" />
            <table className="hours-table">
              <tbody>
                <tr><td>Daily visits</td><td>6:00 AM – 6:00 PM</td></tr>
                <tr><td>Park office</td><td>8:00 AM – 5:00 PM</td></tr>
                <tr><td>Undas (Nov 1–2)</td><td>Extended hours</td></tr>
                <tr><td>Night vigils</td><td>By arrangement</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <SectionHead kicker="Respect the grounds" title="Park rules" />
            <ol className="rules-list">
              <li>Keep noise low; the park is a place of prayer and rest.</li>
              <li>Dispose of trash in bins; clean candles and flowers after visits.</li>
              <li>No overnight structures without office approval.</li>
              <li>Vehicles park only in designated areas near entrances.</li>
              <li>Report damaged markers to staff instead of moving them.</li>
            </ol>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <h2 className="serif" style={{ margin: '0 0 10px' }}>Need a plot or a record correction?</h2>
            <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>Our staff will assist you with availability, requirements, and fees.</p>
            <Link className="btn btn-gold" to="/contact">Contact the park office</Link>
          </div>
        </div>
      </section>
    </>
  );
}
