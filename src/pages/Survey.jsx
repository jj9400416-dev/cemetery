import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHero, SectionHead, useToast } from '../ui.jsx';
import { useSurvey } from '../survey.jsx';
import {
  SURVEY_QUESTIONS,
  SURVEY_SECTIONS,
  RESPONDENT_PROFILE_FIELDS,
  LIKERT_OPTIONS,
} from '../surveyData.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY_FORM = {
  name: '',
  email: '',
  age: '',
  sex: '',
  relationship: '',
  visitFrequency: '',
  device: '',
  browser: '',
};

export default function Survey() {
  const toast = useToast();
  const { submitResponse } = useSurvey();
  const [consented, setConsented] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Ref-based lock: guards against a double click creating two response rows.
  const submitting = useRef(false);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const pick = (no, value) => setAnswers((a) => ({ ...a, [no]: value }));

  const answeredCount = SURVEY_QUESTIONS.filter((_, i) => answers[i + 1]).length;

  const submit = async (e) => {
    e.preventDefault();
    if (submitting.current) return;
    const errs = {};
    if (!form.name.trim()) errs.name = 'Please enter your full name.';
    if (!EMAIL_RE.test(form.email.trim())) errs.email = 'Please enter a valid email address.';
    if (form.age.trim()) {
      const age = Number(form.age);
      if (!Number.isInteger(age) || age < 1 || age > 120) {
        errs.age = 'Please enter an age between 1 and 120, or leave this blank.';
      }
    }
    const unanswered = SURVEY_QUESTIONS.map((_, i) => i + 1).filter((n) => !answers[n]);
    if (unanswered.length) {
      errs.answers = `Please answer all ${SURVEY_QUESTIONS.length} statements. Still missing: ${unanswered.join(', ')}.`;
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('Please complete the survey before submitting.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    const res = await submitResponse({
      name: form.name.trim(),
      email: form.email.trim(),
      profile: {
        age: form.age.trim() ? Number(form.age) : null,
        sex: form.sex || null,
        relationship: form.relationship || null,
        visit_frequency: form.visitFrequency || null,
        device_used: form.device || null,
        browser_used: form.browser || null,
      },
      answers,
    });
    setBusy(false);
    submitting.current = false;
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
    setForm({ ...EMPTY_FORM });
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
                  <li><b>What we collect:</b> your name, email address, respondent profile details, and your answers to {SURVEY_QUESTIONS.length} statements. Profile items marked <i>when applicable</i> may be left blank.</li>
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
                kicker="Step 2 of 2 · Respondent evaluation form"
                title="Your feedback"
                text="Tell us about yourself, then rate each statement using the five-point scale."
              />

              <div className="survey-block">
                <div className="survey-block-head">
                  <div className="kicker">Part 1 · Respondent profile</div>
                  <h3 className="serif">About you</h3>
                  <p>
                    These details help us interpret the results and are optional. Items marked{' '}
                    <span className="when-applicable">when applicable</span> may be left blank if
                    they do not describe you.
                  </p>
                </div>

                <div className="form-grid">
                  <div>
                    <label className="field" htmlFor="s-name">Full name *</label>
                    <input
                      id="s-name"
                      className="input"
                      value={form.name}
                      onChange={setField('name')}
                      placeholder="Juan Dela Cruz"
                      autoComplete="name"
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
                      autoComplete="email"
                    />
                    {errors.email && <div className="error-inline">{errors.email}</div>}
                  </div>

                  {RESPONDENT_PROFILE_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="field" htmlFor={`s-${f.key}`}>
                        {f.label}{' '}
                        {f.whenApplicable && <span className="when-applicable">when applicable</span>}
                      </label>
                      {f.type === 'select' ? (
                        <select
                          id={`s-${f.key}`}
                          className="input"
                          value={form[f.key]}
                          onChange={setField(f.key)}
                        >
                          <option value="">Select…</option>
                          {f.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={`s-${f.key}`}
                          className="input"
                          type={f.type}
                          min={f.min}
                          max={f.max}
                          value={form[f.key]}
                          onChange={setField(f.key)}
                          placeholder={f.placeholder}
                          autoComplete={f.autoComplete}
                        />
                      )}
                      {f.hint && <div className="field-hint">{f.hint}</div>}
                      {errors[f.key] && <div className="error-inline">{errors[f.key]}</div>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="survey-block">
                <div className="survey-block-head">
                  <div className="kicker">Part 2 · Evaluation</div>
                  <h3 className="serif">Rate the system</h3>
                  <p>
                    Using the five-point scale, indicate how much you agree with each statement.
                    All {SURVEY_QUESTIONS.length} statements are required.
                  </p>
                </div>

                <div className="likert-scale-note">
                  {LIKERT_OPTIONS.map((o) => (
                    <span key={o.value}><b>{o.value}</b> {o.label}</span>
                  ))}
                </div>

                <div className="survey-progress" style={{ marginTop: 16 }}>
                  Answered {answeredCount} of {SURVEY_QUESTIONS.length} statements
                </div>

                {SURVEY_SECTIONS.map((section) => (
                  <div key={section.key} className="survey-section">
                    <div className="survey-section-head">
                      <div className="kicker">{section.characteristic}</div>
                      <h4 className="serif">{section.title}</h4>
                      <p>{section.text}</p>
                    </div>

                    {section.questionNos.map((no) => {
                      const q = SURVEY_QUESTIONS[no - 1];
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
                  </div>
                ))}
                {errors.answers && <div className="error-inline">{errors.answers}</div>}
              </div>

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
