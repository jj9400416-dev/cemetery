import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';
import { INITIAL_PLACES } from './data.js';

const GravesContext = createContext(null);

export function GravesProvider({ children }) {
  const [places, setPlaces] = useState(INITIAL_PLACES);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [databaseConnected, setDatabaseConnected] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setDbError('');
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from('graves').select('*').order('id');
    if (error) {
      setDbError(error.message);
    } else if (data) {
      if (data.length > 0) setPlaces(data);
      setDatabaseConnected(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addGrave = async (payload) => {
    if (!supabase) {
      const row = { ...payload, id: Math.max(...places.map((p) => p.id), 0) + 1 };
      setPlaces((prev) => [...prev, row]);
      return { ok: true, row };
    }
    const { data, error } = await supabase.from('graves').insert(payload).select();
    if (error) return { ok: false, error: error.message };
    if (data?.length) setPlaces((prev) => [...prev, ...data]);
    else await refresh();
    return { ok: true, row: data?.[0] };
  };

  const removeGrave = async (id) => {
    if (supabase) {
      const { error } = await supabase.from('graves').delete().eq('id', id);
      if (error) return { ok: false, error: error.message };
    }
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    return { ok: true };
  };

  const updateGrave = async (id, patch) => {
    if (supabase) {
      const { data, error } = await supabase.from('graves').update(patch).eq('id', id).select();
      if (error) return { ok: false, error: error.message };
      if (data?.length) {
        setPlaces((prev) => prev.map((p) => (p.id === id ? data[0] : p)));
        return { ok: true, row: data[0] };
      }
    }
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    return { ok: true };
  };

  return (
    <GravesContext.Provider
      value={{ places, loading, dbError, databaseConnected, refresh, addGrave, removeGrave, updateGrave }}
    >
      {children}
    </GravesContext.Provider>
  );
}

export function useGraves() {
  const ctx = useContext(GravesContext);
  if (!ctx) throw new Error('useGraves must be used inside GravesProvider');
  return ctx;
}
