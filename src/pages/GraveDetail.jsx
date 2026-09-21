import { Link, useNavigate, useParams } from 'react-router-dom';
import { useGraves } from '../graves.jsx';
import { mapImage, photoForName } from '../data.js';
import { EmptyState } from '../ui.jsx';

export default function GraveDetail() {
  const { id } = useParams();
  const { places, loading } = useGraves();
  const navigate = useNavigate();
  const place = places.find((p) => String(p.id) === String(id));

  if (loading) {
    return (
      <div className="container" style={{ padding: '40px 20px' }}>
        <div className="skeleton" style={{ height: 420 }} />
      </div>
    );
  }

  if (!place) {
    return (
      <div className="container" style={{ padding: '40px 20px' }}>
        <div className="card">
          <EmptyState title="Record not found" hint="This grave record may have been removed or the link is incorrect." />
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Link className="btn btn-pine" to="/find">Back to map</Link>
          </div>
        </div>
      </div>
    );
  }

  const photo = photoForName(place.name);
  const siblings = places.filter((p) => p.section === place.section && String(p.id) !== String(place.id)).slice(0, 3);

  return (
    <div className="container" style={{ paddingTop: 28, paddingBottom: 56 }}>
      <button className="btn btn-light btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        ← Back
      </button>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <span className="pill">Section {place.section || '—'} · Record #{place.id}</span>
          <h1 className="serif" style={{ margin: '6px 0 14px', fontSize: 38 }}>{place.name}</h1>
          {photo && <img src={photo} alt={place.name} style={{ width: '100%', borderRadius: 14, objectPosition: 'top', objectFit: 'cover', maxHeight: 460, background: '#eee7d5' }} />}
          <div style={{ marginTop: 14 }}>
            <div className="fact"><span>Born</span><span>{place.birthdate || 'Not recorded'}</span></div>
            <div className="fact"><span>Passed away</span><span>{place.dod || 'Not recorded'}</span></div>
            <div className="fact"><span>Section</span><span>{place.section || 'Not recorded'}</span></div>
            <div className="fact" style={{ borderBottom: 0 }}><span>Level</span><span>{place.level ?? '—'}</span></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <Link className="btn btn-gold" to={`/find?name=${encodeURIComponent(place.name)}`}>Show route on map</Link>
            <Link className="btn btn-light" to="/contact">Report an correction</Link>
          </div>
        </div>
        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <h3 className="serif" style={{ margin: '0 0 10px' }}>Location in the park</h3>
            <div className="mini-map">
              <div className="mini-frame">
                <img src={mapImage} alt="Cemetery map with grave location" />
                <span className="marker grave selected has-photo" style={{ left: place.x, top: place.y }}>
                  {photo ? <img src={photo} alt="" className="marker-photo" /> : '✝'}
                </span>
              </div>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: '12px 0 0' }}>
              Marker shows the recorded position in Section {place.section}. Follow the golden route from the Main Entrance on the full map.
            </p>
          </div>
          {siblings.length > 0 && (
            <div className="card">
              <h3 className="serif" style={{ margin: '0 0 12px' }}>Nearby in Section {place.section}</h3>
              {siblings.map((s) => (
                <div key={s.id} className="list-item">
                  {photoForName(s.name) && <img src={photoForName(s.name)} alt="" className="list-thumb" />}
                  <span style={{ flex: 1 }}><b>{s.name}</b></span>
                  <Link className="btn btn-light btn-sm" to={`/grave/${s.id}`}>View</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
