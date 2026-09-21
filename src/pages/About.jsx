import { Link } from 'react-router-dom';
import { PageHero, SectionHead } from '../ui.jsx';
import agnipaPhoto from '../../assets/Agnipa.jpg';

export default function About() {
  return (
    <>
      <PageHero
        eyebrow="About the park"
        title="A place of rest, remembrance, and respect."
        subtitle="Agnipa Memorial Park serves the families of Agnipa, Romblon — keeping every grave recorded, mapped, and cared for."
      />
      <section className="section">
        <div className="container grid grid-2" style={{ alignItems: 'center' }}>
          <div>
            <SectionHead
              kicker="Our story"
              title="Caring for generations of Agnipa families"
              text="What began as a community burial ground has grown into an organized memorial park with mapped sections, recorded histories, and memorial photos — so no loved one is ever hard to find."
            />
            <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
              This website is the park's digital companion: visitors can search records from home,
              staff can keep the registry accurate, and families can share a lasting tribute page
              for each departed loved one.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <Link className="btn btn-pine" to="/find">Explore the map</Link>
              <Link className="btn btn-light" to="/contact">Talk to our staff</Link>
            </div>
          </div>
          <img src={agnipaPhoto} alt="Agnipa Memorial Park grounds" style={{ borderRadius: 18, boxShadow: 'var(--shadow)' }} />
        </div>
      </section>
      <section className="section alt">
        <div className="container">
          <SectionHead kicker="What we stand for" title="Values that guide our care" />
          <div className="grid grid-3">
            <div className="card"><div className="card-icon">🕊️</div><h3>Dignity</h3><p>Every burial, marker, and record is handled with reverence for the departed and their families.</p></div>
            <div className="card"><div className="card-icon">📖</div><h3>Remembrance</h3><p>Names, dates, and photos are preserved so stories live on for children and grandchildren.</p></div>
            <div className="card"><div className="card-icon">🤝</div><h3>Service</h3><p>Staff assist with locating graves, upkeep, and ceremonies — especially during Undas and anniversaries.</p></div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <SectionHead kicker="Good to know" title="Visiting essentials" />
          <div className="grid grid-2">
            <div className="card">
              <h3>📍 Location</h3>
              <p>Agnipa, Romblon, Philippines. Enter through the Main Entrance on the south side; north and east gates open on peak days.</p>
            </div>
            <div className="card">
              <h3>🕰️ Hours</h3>
              <p>Open daily from 6:00 AM to 6:00 PM. Night visits and vigils can be arranged with the park office in advance.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
