// Visitor survey definition + weighted-mean helpers.
// Shared by the public survey page and the admin results panel.

export const SURVEY_QUESTIONS = [
  'The cemetery grounds and graves are clean and well-maintained.',
  'It is easy to locate a grave using the cemetery map.',
  'The memorial records (names and dates) are accurate and complete.',
  'The walking route from the main entrance to the grave is clear and helpful.',
  'The park staff are respectful, accommodating, and responsive.',
  'The website is easy to use and understand.',
  'I would recommend Agnipa Memorial Park to family and friends.',
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
