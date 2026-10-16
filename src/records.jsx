import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';
import { DECEASED_FALLBACK } from './deceasedData.js';

// Deceased registry (public.deceased) — the park's master record of the dead,
// imported from the ledger (see supabase-deceased.sql). Kept separate from
// `graves` (map placements) so the 400+ registry rows don't turn into unmapped
// pins at 50%,50%.
//
// When Supabase isn't configured (or public.deceased can't be reached), we fall
// back to the bundled 489-record snapshot so the registry always shows the full
// list. CRUD then operates on in-memory state only.
const RecordsContext = createContext(null);

export function RecordsProvider({ children }) {
  const [records, setRecords] = useState(DECEASED_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [databaseConnected, setDatabaseConnected] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setDbError('');
    if (!supabase) {
      setRecords(DECEASED_FALLBACK);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from('deceased').select('*').order('name');
    if (error) {
      // Table missing / offline — keep the bundled snapshot so the list stays complete.
      setDbError(error.message);
      setRecords(DECEASED_FALLBACK);
      setDatabaseConnected(false);
    } else if (data) {
      // Use data if available (even if empty array), otherwise fallback
      setRecords(data.length ? data : DECEASED_FALLBACK);
      setDatabaseConnected(true);
    } else {
      setRecords(DECEASED_FALLBACK);
      setDatabaseConnected(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live database (Supabase reachable and the table answered) vs. bundled snapshot.
  const isLive = Boolean(supabase) && databaseConnected;

  const addRecord = async (payload) => {
    if (!isLive) {
      const row = { ...payload, id: Math.max(0, ...records.map((r) => Number(r.id) || 0)) + 1 };
      setRecords((prev) => [...prev, row].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
      return { ok: true, row };
    }
    const { data, error } = await supabase.from('deceased').insert(payload).select();
    if (error) return { ok: false, error: error.message };
    if (data?.length) setRecords((prev) => [...prev, ...data]);
    else await refresh();
    return { ok: true, row: data?.[0] };
  };

  const updateRecord = async (id, patch) => {
    if (isLive) {
      const { data, error } = await supabase.from('deceased').update(patch).eq('id', id).select();
      if (error) return { ok: false, error: error.message };
      if (data?.length) {
        setRecords((prev) => prev.map((r) => (String(r.id) === String(id) ? data[0] : r)));
        return { ok: true, row: data[0] };
      }
    }
    setRecords((prev) => prev.map((r) => (String(r.id) === String(id) ? { ...r, ...patch } : r)));
    return { ok: true };
  };

  const removeRecord = async (id) => {
    if (isLive) {
      const { error } = await supabase.from('deceased').delete().eq('id', id);
      if (error) return { ok: false, error: error.message };
    }
    setRecords((prev) => prev.filter((r) => String(r.id) !== String(id)));
    return { ok: true };
  };

  return (
    <RecordsContext.Provider
      value={{ records, loading, dbError, databaseConnected, refresh, addRecord, updateRecord, removeRecord }}
    >
      {children}
    </RecordsContext.Provider>
  );
}

export function useRecords() {
  const ctx = useContext(RecordsContext);
  if (!ctx) throw new Error('useRecords must be used inside RecordsProvider');
  return ctx;
}
