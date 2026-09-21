import { createContext, useContext, useState } from 'react';
import { supabase } from './supabaseClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [authError, setAuthError] = useState('');

  const loginAdmin = async (email, password) => {
    setAuthError('');
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error.message);
        return { ok: false, error: error.message };
      }
      setIsAdmin(true);
      setAdminEmail(email);
      return { ok: true };
    }
    // Local fallback when Supabase is not configured
    if (email === 'Admin' && password === '12345678') {
      setIsAdmin(true);
      setAdminEmail(email);
      return { ok: true };
    }
    const msg = 'Invalid username or password.';
    setAuthError(msg);
    return { ok: false, error: msg };
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setIsAdmin(false);
    setAdminEmail('');
  };

  return (
    <AuthContext.Provider value={{ isAdmin, adminEmail, authError, loginAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
