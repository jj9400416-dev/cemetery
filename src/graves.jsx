import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';
import { INITIAL_PLACES } from './data.js';
import { addCustomRoutes, ROUTES } from './routing.js';

// Pins sit exactly at the end of their reference navigation line, even if the
// stored x/y in the database hasn't been updated to match the extracted route.
const ROUTE_END_BY_NAME = new Map();
for (const r of ROUTES) {
  if (!r?.grave || !r?.waypoints?.length) continue;
  // ROUTES is sorted so canonical `*.route.json` files come first — keep the first.
  const key = String(r.grave).toLowerCase().replace(/[^a-z]/g, '');
  if (!ROUTE_END_BY_NAME.has(key)) ROUTE_END_BY_NAME.set(key, r.waypoints[r.waypoints.length - 1]);
}

function snapPinsToRouteEnds(rows) {
  return (rows || []).map((p) => {
    const end = ROUTE_END_BY_NAME.get(String(p.name || '').toLowerCase().replace(/[^a-z]/g, ''));
    return end ? { ...p, x: `${end.x}%`, y: `${end.y}%` } : p;
  });
}

const GravesContext = createContext(null);

export function GravesProvider({ children }) {
  const [places, setPlaces] = useState(() => snapPinsToRouteEnds(INITIAL_PLACES));
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
      try {
        const { data: cr } = await supabase.from('custom_routes').select('*');
        if (cr?.length) addCustomRoutes(cr);
      } catch {
        // custom routes table missing — bundled routes still work
      }
      if (data.length > 0) setPlaces(snapPinsToRouteEnds(data));
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
      setPlaces((prev) => snapPinsToRouteEnds([...prev, row]));
      return { ok: true, row };
    }
    const { data, error } = await supabase.from('graves').insert(payload).select();
    if (error) return { ok: false, error: error.message };
    if (data?.length) setPlaces((prev) => snapPinsToRouteEnds([...prev, ...data]));
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
