import { createContext, useContext, useState } from 'react';
import { supabase } from './supabaseClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [authError, setAuthError] = useState('');

  const loginAdmin = async (email, password) => {
    setAuthError('');
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    // Local master admin — checked first so it works with or without Supabase.
    // NOTE: hardcoded credential, visible in the client bundle. Replace with a
    // proper Supabase Auth user for production.
    if (trimmedEmail.toLowerCase() === 'admin' && trimmedPassword === 'ADMIN123') {
      setIsSignedIn(true);
      setIsAdmin(true);
      setAdminEmail(trimmedEmail);
      return { ok: true, admin: true };
    }
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password: trimmedPassword });
      if (error) {
        setAuthError(error.message);
        return { ok: false, error: error.message };
      }
      const userEmail = data?.user?.email;
      const { data: adminRow, error: adminErr } = userEmail
        ? await supabase.from('admins').select('email').eq('email', userEmail).maybeSingle()
        : { data: null, error: { message: 'missing email' } };
      if (adminErr || !adminRow) {
        await supabase.auth.signOut();
        const msg = 'This account is not approved yet. Ask an admin to allow-list it (supabase-admins.sql), then sign in.';
        setAuthError(msg);
        return { ok: false, error: msg };
      }
      setIsSignedIn(true);
      setIsAdmin(true);
      setAdminEmail(trimmedEmail);
      return { ok: true, admin: true };
    }
    // Local fallback when Supabase is not configured
    if (trimmedEmail.toLowerCase() === 'admin' && trimmedPassword === 'LGUADMIN') {
      setIsSignedIn(true);
      setIsAdmin(true);
      setAdminEmail(trimmedEmail);
      return { ok: true, admin: true };
    }
    const msg = 'Invalid username or password.';
    setAuthError(msg);
    return { ok: false, error: msg };
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setIsSignedIn(false);
    setIsAdmin(false);
    setAdminEmail('');
  };

  return (
    <AuthContext.Provider value={{ isAdmin, isSignedIn, adminEmail, authError, loginAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
