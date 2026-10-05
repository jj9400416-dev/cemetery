import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../supabaseClient.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../ui.jsx';

// Self-registration with AUTO-APPROVAL: a DB trigger admins every new sign-up
// instantly (supabase-admins.sql), so the account signs straight in.
export default function Signup() {
  const navigate = useNavigate();
  const toast = useToast();
  const { loginAdmin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (!isSupabaseConfigured || !supabase) {
      toast.error('Account creation needs Supabase — it is not configured.');
      return;
    }
    if (!email.trim() || password.length < 6) {
      toast.error('Enter an email and a password of at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    // Auto-approved by the DB trigger — sign straight in, no waiting.
    const login = await loginAdmin(email.trim(), password);
    setBusy(false);
    if (login.ok) {
      toast.success('Account created — approved and signed in.');
      navigate('/', { replace: true });
      return;
    }
    if (data?.session) {
      await supabase.auth.signOut();
      toast.error('Approved, but sign-in failed — try the login page.');
      navigate('/login', { replace: true });
    } else {
      toast.success('Account created and approved. Check your email to confirm it, then sign in.');
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <Link to="/" className="login-logo">
          <span className="brand-mark">✝</span>
          <span className="brand-name">Agnipa Memorial Park</span>
        </Link>
        <span className="pill">New account</span>
        <h1 className="serif">Create account</h1>
        <p className="sub">Create an account — you're approved instantly and signed straight in.</p>
        <form onSubmit={submit}>
          <label className="field" htmlFor="s-email">Email</label>
          <input id="s-email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          <div style={{ marginTop: 12 }}>
            <label className="field" htmlFor="s-pass">Password (min 6 characters)</label>
            <input id="s-pass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field" htmlFor="s-pass2">Confirm password</label>
            <input id="s-pass2" className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          </div>
          <button className="btn btn-gold" type="submit" disabled={busy} style={{ width: '100%', marginTop: 18 }}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/login" className="btn btn-pine" style={{ width: '100%' }}>Log In</Link>
        </p>
      </div>
    </div>
  );
}
