import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useToast } from '../ui.jsx';
import { isSupabaseConfigured } from '../supabaseClient.js';

// Standalone login page for regular accounts. Staff use /admin-login —
// a button on this page links there. After a successful login the user is
// sent to ?next= (default home page '/').
export default function Login() {
  const { isAdmin, isSignedIn, loginUser, authError } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const rawNext = params.get('next') || '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (isAdmin) return <Navigate to={next} replace />;
  if (isSignedIn) {
    // Non-admins are never sent to the records dashboard, even if they
    // arrived here via /admin (?next=/admin).
    return <Navigate to={next.startsWith('/admin') ? '/' : next} replace />;
  }

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    const res = await loginUser(email, password);
    setBusy(false);
    if (res.ok) {
      toast.success(res.admin ? 'Welcome back. You are signed in as admin.' : 'Signed in successfully.');
      const wantsAdminArea = next.startsWith('/admin');
      if (wantsAdminArea && !res.admin) {
        toast.error('That account is not an admin — the records dashboard is restricted.');
        navigate('/', { replace: true });
        return;
      }
      navigate(next, { replace: true });
    } else {
      toast.error(res.error || 'Login failed.');
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <Link to="/" className="login-logo">
          <span className="brand-mark">✝</span>
          <span className="brand-name">Agnipa Memorial Park</span>
        </Link>
        <h1 className="serif">Login</h1>
        <p className="sub">
          {isSupabaseConfigured
            ? 'Sign in to your account to continue.'
            : 'Supabase is not configured — sign-in is unavailable.'}
        </p>
        <form onSubmit={submit}>
          <label className="field" htmlFor="l-email">Email / Username</label>
          <input id="l-email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="username" />
          <div style={{ marginTop: 12 }}>
            <label className="field" htmlFor="l-pass">Password</label>
            <div style={{ position: 'relative' }}>
              <input id="l-pass" className="input" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" style={{ paddingRight: 44 }} />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--muted)', display: 'flex', alignItems: 'center' }}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>
          {authError && <p className="error-text">{authError}</p>}
          <button className="btn btn-gold" type="submit" disabled={busy} style={{ width: '100%', marginTop: 18 }}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/signup" className="btn btn-pine" style={{ width: '100%' }}>Create Account</Link>
        </p>
        <p style={{ textAlign: 'center', marginTop: 12 }}>
          <Link to="/admin-login" className="btn btn-light" style={{ width: '100%' }}>Admin Login →</Link>
        </p>

      </div>
    </div>
  );
}
