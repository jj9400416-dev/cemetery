import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';
import { SURVEY_QUESTIONS, likertLabel } from './surveyData.js';

// Visitor survey responses. Backed by Supabase (public.survey_responses +
// public.survey_answers — see supabase-survey.sql) when configured; otherwise
// kept in localStorage so the survey and the admin results still work offline.
const SurveyContext = createContext(null);
const LOCAL_KEY = 'survey_responses';

function readLocal() {
  try {
    const rows = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeLocal(rows) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
  } catch {
    /* storage unavailable — ignore */
  }
}

// PostgREST error codes that mean "the RPC does not exist" (i.e. the optional
// submit_survey_response function has not been installed in the database).
const MISSING_RPC_CODES = new Set(['PGRST202', '42883', '42P01']);
function isMissingRpc(error) {
  if (!error) return false;
  if (MISSING_RPC_CODES.has(error.code)) return true;
  return /does not exist|not found|could not find|unknown function/i.test(error.message || '');
}

// The respondent-profile columns are newer than the original survey tables.
// If supabase-survey.sql has not been re-run yet, fall back to the original
// columns instead of breaking the survey or the admin results.
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204']);
function isMissingColumn(error) {
  if (!error) return false;
  if (MISSING_COLUMN_CODES.has(error.code)) return true;
  return /column .* does not exist|could not find the '.*' column/i.test(error.message || '');
}

const PROFILE_COLUMNS = ['age', 'sex', 'relationship', 'visit_frequency', 'device_used', 'browser_used'];
const RESPONSE_SELECT_BASE =
  'id, name, email, consent, created_at, survey_answers(question_no, answer_value)';
const RESPONSE_SELECT_PROFILE =
  'id, name, email, consent, age, sex, relationship, visit_frequency, device_used, browser_used, created_at, survey_answers(question_no, answer_value)';

const profileColumns = (profile = {}) =>
  Object.fromEntries(PROFILE_COLUMNS.map((key) => [key, profile?.[key] ?? null]));

export function SurveyProvider({ children }) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [databaseConnected, setDatabaseConnected] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setDbError('');
    if (!supabase) {
      setResponses(readLocal());
      setLoading(false);
      return;
    }
    let { data, error } = await supabase
      .from('survey_responses')
      .select(RESPONSE_SELECT_PROFILE)
      .order('created_at', { ascending: false });
    if (error && isMissingColumn(error)) {
      // Profile columns not installed yet — keep the older select working.
      ({ data, error } = await supabase
        .from('survey_responses')
        .select(RESPONSE_SELECT_BASE)
        .order('created_at', { ascending: false }));
    }
    if (error) {
      // Table missing / offline — fall back to anything saved locally.
      setDbError(error.message);
      setResponses(readLocal());
      setDatabaseConnected(false);
    } else {
      const rows = (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        consent: r.consent,
        created_at: r.created_at,
        profile: profileColumns(r),
        answers: Object.fromEntries(
          (r.survey_answers || []).map((a) => [a.question_no, a.answer_value])
        ),
      }));
      setResponses(rows);
      setDatabaseConnected(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Persist one response plus its answers.
  //
  // The response row and the answer rows must land together. If they are
  // written separately and the answer write fails, the orphan response row is
  // still counted in the admin "Responses" total while the weighted-mean
  // denominator N skips it — that is what made N (117) disagree with the
  // total (120). So: prefer the atomic SQL function when it is installed,
  // otherwise write the answers and roll the response row back if they fail.
  const submitResponse = async ({ name, email, profile, answers }) => {
    const isLive = Boolean(supabase) && databaseConnected;
    const profileValues = profileColumns(profile);
    if (isLive) {
      const answerRows = SURVEY_QUESTIONS.map((text, i) => {
        const no = i + 1;
        return {
          question_no: no,
          question_text: text,
          answer_value: answers[no],
          answer_label: likertLabel(answers[no]),
        };
      });

      // 1) Preferred path: one transactional statement in Postgres.
      const { error: rpcError } = await supabase.rpc('submit_survey_response', {
        p_name: name,
        p_email: email,
        p_profile: profileValues,
        p_answers: answerRows,
      });
      if (!rpcError) {
        await refresh();
        return { ok: true };
      }
      // The function is optional — fall back when it simply is not installed.
      if (!isMissingRpc(rpcError)) {
        return { ok: false, error: rpcError.message };
      }

      // 2) Fallback path: two writes, with a compensating delete on failure.
      let { data, error } = await supabase
        .from('survey_responses')
        .insert({ name, email, consent: true, ...profileValues })
        .select('id')
        .single();
      if (error && isMissingColumn(error)) {
        // Older table without the profile columns — save the core response.
        ({ data, error } = await supabase
          .from('survey_responses')
          .insert({ name, email, consent: true })
          .select('id')
          .single());
      }
      if (error) return { ok: false, error: error.message };

      const { data: inserted, error: answerError } = await supabase
        .from('survey_answers')
        .insert(answerRows.map((a) => ({ ...a, response_id: data.id })))
        .select('id');
      const saved = Array.isArray(inserted) ? inserted.length : answerRows.length;
      if (answerError || saved !== answerRows.length) {
        // Roll back so no empty response is left behind.
        await supabase.from('survey_responses').delete().eq('id', data.id);
        return {
          ok: false,
          error: answerError?.message || 'Your answers could not be saved. Please try again.',
        };
      }
      await refresh();
      return { ok: true };
    }

    // Offline / not-yet-configured: keep the response locally.
    const row = {
      id: Date.now(),
      name,
      email,
      consent: true,
      created_at: new Date().toISOString(),
      profile: profileValues,
      answers,
    };
    const next = [row, ...readLocal()];
    writeLocal(next);
    setResponses(next);
    return { ok: true };
  };

  const removeResponse = async (id) => {
    const isLive = Boolean(supabase) && databaseConnected;
    if (isLive) {
      const { error } = await supabase.from('survey_responses').delete().eq('id', id);
      if (error) return { ok: false, error: error.message };
      setResponses((prev) => prev.filter((r) => String(r.id) !== String(id)));
      return { ok: true };
    }
    const next = readLocal().filter((r) => String(r.id) !== String(id));
    writeLocal(next);
    setResponses(next);
    return { ok: true };
  };

  return (
    <SurveyContext.Provider
      value={{ responses, loading, dbError, databaseConnected, refresh, submitResponse, removeResponse }}
    >
      {children}
    </SurveyContext.Provider>
  );
}

export function useSurvey() {
  const ctx = useContext(SurveyContext);
  if (!ctx) throw new Error('useSurvey must be used inside SurveyProvider');
  return ctx;
}
