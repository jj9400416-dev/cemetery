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
    const { data, error } = await supabase
      .from('survey_responses')
      .select('id, name, email, consent, created_at, survey_answers(question_no, answer_value)')
      .order('created_at', { ascending: false });
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

  const submitResponse = async ({ name, email, answers }) => {
    const isLive = Boolean(supabase) && databaseConnected;
    if (isLive) {
      const { data, error } = await supabase
        .from('survey_responses')
        .insert({ name, email, consent: true })
        .select('id')
        .single();
      if (error) return { ok: false, error: error.message };
      const answerRows = SURVEY_QUESTIONS.map((text, i) => {
        const no = i + 1;
        return {
          response_id: data.id,
          question_no: no,
          question_text: text,
          answer_value: answers[no],
          answer_label: likertLabel(answers[no]),
        };
      });
      const { error: answerError } = await supabase.from('survey_answers').insert(answerRows);
      if (answerError) return { ok: false, error: answerError.message };
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
