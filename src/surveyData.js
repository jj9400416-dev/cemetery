// Visitor survey definition + weighted-mean helpers.
// Shared by the public survey page and the admin results panel.
//
// The form mirrors the respondent evaluation instrument: a short respondent
// profile followed by the 15 evaluation statements, grouped under the
// ISO/IEC 25010 characteristics they were drawn from. Question numbers are
// stable — they are the keys stored in public.survey_answers — so new items
// must be appended, never inserted in the middle.

export const SURVEY_QUESTIONS = [
  'The survey responds quickly.',
  'The system runs efficiently.',
  'The system shows deceased information quickly.',
  'The system performs its intended task.',
  'The system produces expected results.',
  'The system provides a clear map and route guide.',
  'The system locates graves accurately.',
  'The system shows accurate deceased information.',
  'The system runs without error.',
  'The system is easy to use and understand.',
  'The system provides accurate content.',
  'The system has a simple, easy-to-follow user interface.',
  'The system works properly with commonly used web browsers.',
  'The system works properly across different devices.',
  'The system works without error across different devices and web browsers.',
];

// Five-point Likert scale. `value` doubles as the weight (w) used in the
// weighted-mean formula x̄ = Σ(f·w) / N. Order is strongest → weakest.
export const LIKERT_OPTIONS = [
  { label: 'Strongly Agree', short: 'SA', value: 5, color: '#1a7f5a' },
  { label: 'Agree', short: 'A', value: 4, color: '#4caf7d' },
  { label: 'Moderately Agree', short: 'MA', value: 3, color: '#c9a227' },
  { label: 'Disagree', short: 'D', value: 2, color: '#e08e3c' },
  { label: 'Strongly Disagree', short: 'SD', value: 1, color: '#b3372a' },
];

// The administered instrument is divided into evaluation areas. `questionNos`
// are 1-based and map straight onto SURVEY_QUESTIONS above, so a section can
// never drift away from the statements it contains.
export const SURVEY_SECTIONS = [
  {
    key: 'performance',
    title: 'Performance efficiency',
    characteristic: 'ISO/IEC 25010 · Performance efficiency',
    text: 'How quickly and efficiently the system responds.',
    questionNos: [1, 2, 3],
  },
  {
    key: 'functional',
    title: 'Functional suitability',
    characteristic: 'ISO/IEC 25010 · Functional suitability',
    text: 'Whether the system performs the task it is intended to perform.',
    questionNos: [4, 5],
  },
  {
    key: 'navigation',
    title: 'Navigation and accuracy',
    characteristic: 'ISO/IEC 25010 · Functional correctness / Usability',
    text: 'Whether the map, routes, and deceased records are clear and correct.',
    questionNos: [6, 7, 8],
  },
  {
    key: 'reliability',
    title: 'Reliability',
    characteristic: 'ISO/IEC 25010 · Reliability',
    text: 'Whether the system runs without error.',
    questionNos: [9],
  },
  {
    key: 'usability',
    title: 'Usability and content',
    characteristic: 'ISO/IEC 25010 · Usability / Functional correctness',
    text: 'Whether the system is easy to use and its content is accurate.',
    questionNos: [10, 11, 12],
  },
  {
    key: 'compatibility',
    title: 'Compatibility',
    characteristic: 'ISO/IEC 25010 · Compatibility',
    text: 'Whether the system works across devices and web browsers.',
    questionNos: [13, 14, 15],
  },
];

// Respondent profile fields collected before the evaluation proper. Items
// marked `whenApplicable` are optional and shown with a "when applicable"
// note, because they do not describe every respondent (e.g. a visitor who is
// not related to anyone interred in the park).
export const RESPONDENT_PROFILE_FIELDS = [
  {
    key: 'age',
    label: 'Age',
    type: 'number',
    placeholder: 'e.g. 28',
    min: 1,
    max: 120,
    autoComplete: 'age',
  },
  {
    key: 'sex',
    label: 'Sex',
    type: 'select',
    options: ['Female', 'Male', 'Prefer not to say'],
  },
  {
    key: 'relationship',
    label: 'Relationship to the deceased',
    type: 'select',
    whenApplicable: true,
    hint: 'Answer this only if you are visiting a relative or someone you know.',
    options: ['Spouse', 'Parent', 'Child', 'Sibling', 'Relative', 'Friend', 'Other'],
  },
  {
    key: 'visitFrequency',
    label: 'How often do you visit the park?',
    type: 'select',
    options: ['First visit', 'Weekly', 'Monthly', 'A few times a year', 'Rarely'],
  },
  {
    key: 'device',
    label: 'Device used to access the system',
    type: 'select',
    whenApplicable: true,
    hint: 'Answer this only if you used the online system during your visit.',
    options: ['Smartphone', 'Tablet', 'Laptop', 'Desktop computer'],
  },
  {
    key: 'browser',
    label: 'Web browser used',
    type: 'select',
    whenApplicable: true,
    hint: 'Answer this only if you know which browser you used.',
    options: ['Chrome', 'Microsoft Edge', 'Firefox', 'Safari', 'Other'],
  },
];

// Storage/display order for the profile columns on public.survey_responses.
export const RESPONDENT_PROFILE_COLUMNS = [
  { key: 'age', label: 'Age' },
  { key: 'sex', label: 'Sex' },
  { key: 'relationship', label: 'Relationship' },
  { key: 'visit_frequency', label: 'Visit frequency' },
  { key: 'device_used', label: 'Device used' },
  { key: 'browser_used', label: 'Browser used' },
];

export const likertLabel = (value) =>
  LIKERT_OPTIONS.find((o) => o.value === Number(value))?.label || '';

// Standard Likert interpretation bands for a weighted mean between 1.00 and 5.00.
export function interpretMean(mean) {
  if (!mean) return { label: 'No responses yet', tone: 'muted' };
  if (mean >= 4.21) return { label: 'Strongly Agree', tone: 'strong-agree' };
  if (mean >= 3.41) return { label: 'Agree', tone: 'agree' };
  if (mean >= 2.61) return { label: 'Moderately Agree', tone: 'moderate' };
  if (mean >= 1.81) return { label: 'Disagree', tone: 'disagree' };
  return { label: 'Strongly Disagree', tone: 'strong-disagree' };
}

// Weighted mean for a single survey question:
//   x̄ = Σ(f·w) / N
// where f = frequency of each response option, w = its weight, N = total
// responses to that question (N = Σf).
// `responses` = array of { answers: { [questionNo]: value } }.
export function computeWeightedMean(responses, questionNo) {
  const counts = {};
  for (const o of LIKERT_OPTIONS) counts[o.value] = 0;
  let n = 0;
  for (const r of responses) {
    const v = Number(r?.answers?.[questionNo]);
    if (LIKERT_OPTIONS.some((o) => o.value === v)) {
      counts[v] += 1;
      n += 1;
    }
  }
  const sumFw = LIKERT_OPTIONS.reduce((sum, o) => sum + counts[o.value] * o.value, 0);
  const mean = n ? sumFw / n : 0;
  return { counts, n, sumFw, mean, interpretation: interpretMean(mean) };
}

// A response counts towards N only if it carries at least one valid Likert
// value. Rows whose answer write failed stay in the response total but are
// skipped here, which is why the two numbers can differ.
export function isAnswered(response) {
  return SURVEY_QUESTIONS.some((_, i) => {
    const v = Number(response?.answers?.[i + 1]);
    return LIKERT_OPTIONS.some((o) => o.value === v);
  });
}

export function answeredCount(responses) {
  return responses.reduce((sum, r) => sum + (isAnswered(r) ? 1 : 0), 0);
}
