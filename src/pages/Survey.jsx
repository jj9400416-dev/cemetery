import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHero, SectionHead, useToast } from '../ui.jsx';
import { useSurvey } from '../survey.jsx';
import { SURVEY_QUESTIONS, LIKERT_OPTIONS } from '../surveyData.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Survey() {
  const toast = useToast();
  const { submitResponse } = useSurvey();
  const [consented, setConsented] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const pick = (no, value) => setAnswers((a) => ({ ...a, [no]: value }));

  const answeredCount = SURVEY_QUESTIONS.filter((_, i) => answers[i + 1]).length;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = 'Please enter your full name.';
    if (!EMAIL_RE.test(form.email.trim())) errs.email = 'Please enter a valid email address.';
    const unanswered = SURVEY_QUESTIONS.map((_, i) => i + 1).filter((n) => !answers[n]);
    if (unanswered.length) {
      errs.answers = `Please answer all ${SURVEY_QUESTIONS.length} questions. Still missing: ${unanswered.join(', ')}.`;
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Please complete the survey before submitting.');
      return;
    }
    setBusy(true);
    const res = await submitResponse({
      name: form.name.trim(),
      email: form.email.trim(),
      answers,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error('Could not save your response: ' + res.error);
      return;
    }
    setSubmitted(true);
    toast.success('Thank you! Your response has been recorded.');
  };

  const reset = () => {
    setSubmitted(false);
    setConsented(false);
    setForm({ name: '', email: '' });
    setAnswers({});
    setErrors({});
  };

  return (
    <>
      <PageHero
        eyebrow="Visitor survey"
        title="Help us serve you better."
        subtitle="Share your experience of Agnipa Memorial Park. It takes about two minutes, and your answers are kept confidential."
      />
      <section className="section">
        <div className="container" style={{ maxWidth: 880 }}>
          {submitted ? (
            <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
              <div style={{ fontSize: 60 }}>🙏</div>
              <h2 className="serif" style={{ margin: '8px 0' }}>
                Thank you, {form.name.split(' ')[0] || 'friend'}!
              </h2>
              <p style={{ color: 'var(--muted)', maxWidth: 540, margin: '0 auto 20px' }}>
                Your responses have been recorded and will help the park improve its grounds,
                records, and services for the families it serves.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link className="btn btn-pine" to="/">Back to home</Link>
                <button className="btn btn-light" onClick={reset}>Submit another response</button>
              </div>
            </div>
          ) : !consented ? (
            <div className="card">
              <SectionHead kicker="Step 1 of 2 · Consent" title="Informed consent" />
              <div className="consent-box">
                <h4>Purpose of this survey</h4>
                <p style={{ margin: 0 }}>
                  Agnipa Memorial Park is improving its grounds, records, and services. We invite
                  visitors to share their honest experience through a short questionnaire. Your
                  feedback is used only to make the park better.
                </p>
                <ul>
                  <li><b>What we collect:</b> your name, email address, and your answers to 7 statements.</li>
                  <li><b>How it is used:</b> answers are combined into summary statistics (average ratings) for park planning. Your email is used only to contact you if follow-up is needed.</li>
                  <li><b>Confidentiality:</b> results are reported in aggregate. Your individual answers are not published.</li>
                  <li><b>Voluntary:</b> participation is completely voluntary and you may withdraw at any time.</li>
                  <li><b>Questions?</b> Contact the park office via the <Link to="/contact">Contact page</Link>.</li>
                </ul>
              </div>

              <label className={`consent-check ${consented ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={consented}
                  onChange={(e) => setConsented(e.target.checked)}
                />
                <span>
                  I have read and understood the consent statement above. I voluntarily agree to
                  take part in this survey and allow my responses and email to be recorded.
                </span>
              </label>

              <button
                className="btn btn-green"
                disabled={!consented}
                onClick={() => setConsented(true)}
                style={{ width: '100%' }}
              >
                Continue to survey →
              </button>
              <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', margin: '12px 0 0' }}>
                You must tick the consent box to continue.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="card">
              <SectionHead
                kicker="Step 2 of 2 · Questionnaire"
                title="Your feedback"
                text="Tell us who you are, then rate each statement on the scale below."
              />

              <div className="form-grid">
                <div>
                  <label className="field" htmlFor="s-name">Full name *</label>
                  <input
                    id="s-name"
                    className="input"
                    value={form.name}
                    onChange={setField('name')}
                    placeholder="Juan Dela Cruz"
                  />
                  {errors.name && <div className="error-inline">{errors.name}</div>}
                </div>
                <div>
                  <label className="field" htmlFor="s-email">Email address *</label>
                  <input
                    id="s-email"
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={setField('email')}
                    placeholder="juan@example.com"
                  />
                  {errors.email && <div className="error-inline">{errors.email}</div>}
                </div>
              </div>

              <div className="survey-progress" style={{ marginTop: 22 }}>
                Answered {answeredCount} of {SURVEY_QUESTIONS.length}
              </div>

              {SURVEY_QUESTIONS.map((q, i) => {
                const no = i + 1;
                const missing = !answers[no];
                return (
                  <div
                    key={no}
                    className={`survey-question ${missing && errors.answers ? 'unanswered' : ''}`}
                  >
                    <div className="q-text">
                      <span className="q-num">{no}.</span> {q}
                    </div>
                    <div className="likert-options">
                      {LIKERT_OPTIONS.map((o) => (
                        <label
                          key={o.value}
                          className={`likert-pill ${answers[no] === o.value ? 'selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name={`q${no}`}
                            value={o.value}
                            checked={answers[no] === o.value}
                            onChange={() => pick(no, o.value)}
                          />
                          <span className="likert-dot" />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {errors.answers && <div className="error-inline">{errors.answers}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-light" onClick={() => setConsented(false)}>
                  ← Back to consent
                </button>
                <button type="submit" className="btn btn-green" disabled={busy}>
                  {busy ? 'Submitting…' : 'Submit survey'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
