import { useState } from 'react';
import { PageHero, SectionHead, useToast } from '../ui.jsx';

export default function Contact() {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', contact: '', subject: 'Record correction', message: '' });
  const [sent, setSent] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.contact.trim() || !form.message.trim()) {
      toast.error('Please fill in your name, contact, and message.');
      return;
    }
    try {
      const outbox = JSON.parse(localStorage.getItem('inquiries') || '[]');
      outbox.push({ ...form, at: new Date().toISOString() });
      localStorage.setItem('inquiries', JSON.stringify(outbox));
    } catch {
      /* storage unavailable — still confirm */
    }
    setSent(true);
    toast.success('Inquiry received. Our staff will reach out to you.');
  };

  return (
    <>
      <PageHero
        eyebrow="Get in touch"
        title="Contact the park office."
        subtitle="Questions about plots, records, corrections, or visits — send us a message."
      />
      <section className="section">
        <div className="container grid grid-2" style={{ alignItems: 'start' }}>
          <div>
            <SectionHead kicker="Visit or call" title="Office information" />
            <div className="grid" style={{ gap: 14 }}>
              <div className="card"><div className="card-icon">📍</div><h3>Location</h3><p>Agnipa, Romblon, Philippines — Main Entrance, south side of the park.</p></div>
              <div className="card"><div className="card-icon">🕰️</div><h3>Office hours</h3><p>Monday – Saturday, 8:00 AM – 5:00 PM. Grounds open daily 6:00 AM – 6:00 PM.</p></div>
              <div className="card"><div className="card-icon">📋</div><h3>What to prepare</h3><p>For record corrections, bring a valid ID and supporting documents (e.g. death certificate) so staff can verify quickly.</p></div>
            </div>
          </div>
          <div className="card">
            {sent ? (
              <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                <div style={{ fontSize: 56 }}>💌</div>
                <h3 className="serif" style={{ fontSize: 26 }}>Thank you, {form.name.split(' ')[0] || 'friend'}.</h3>
                <p style={{ color: 'var(--muted)' }}>Your inquiry has been noted. Please visit the office or await our call for verification and next steps.</p>
                <button className="btn btn-light" onClick={() => { setSent(false); setForm({ name: '', contact: '', subject: 'Record correction', message: '' }); }}>
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h3 className="serif" style={{ margin: '0 0 16px', fontSize: 24 }}>Send an inquiry</h3>
                <div className="form-grid">
                  <div>
                    <label className="field" htmlFor="c-name">Full name</label>
                    <input id="c-name" className="input" value={form.name} onChange={set('name')} placeholder="Juan Dela Cruz" />
                  </div>
                  <div>
                    <label className="field" htmlFor="c-contact">Contact (phone / email)</label>
                    <input id="c-contact" className="input" value={form.contact} onChange={set('contact')} placeholder="09xx xxx xxxx" />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label className="field" htmlFor="c-subject">Subject</label>
                  <select id="c-subject" className="select" value={form.subject} onChange={set('subject')}>
                    <option>Record correction</option>
                    <option>Burial plot inquiry</option>
                    <option>Grave locating help</option>
                    <option>Maintenance request</option>
                    <option>Other concern</option>
                  </select>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label className="field" htmlFor="c-message">Message</label>
                  <textarea
                    id="c-message"
                    className="textarea"
                    value={form.message}
                    onChange={set('message')}
                    placeholder="Describe the grave (name, section) and what you need…"
                  />
                </div>
                <button className="btn btn-pine" type="submit" style={{ marginTop: 16, width: '100%' }}>
                  Send Inquiry
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
