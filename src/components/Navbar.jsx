import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/find', label: 'Find a Grave' },
  { to: '/about', label: 'About' },
  { to: '/services', label: 'Services' },
  { to: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { isAdmin, isSignedIn, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    setOpen(false);
    navigate('/');
  };

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">✝</span>
          <span className="brand-name">
            Agnipa Memorial Park
            <small>Cemetery Map</small>
          </span>
        </Link>
        <button className="hamburger" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
          {open ? '✕' : '☰'}
        </button>
        <nav className={`nav-links ${open ? 'open' : ''}`}>
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {l.label}
            </NavLink>
          ))}
          {isAdmin ? (
            <>
              <NavLink
                to="/admin"
                onClick={() => setOpen(false)}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                Dashboard
              </NavLink>
              <a href="#logout" onClick={(e) => { e.preventDefault(); handleLogout(); }}>
                Logout
              </a>
            </>
          ) : isSignedIn ? (
            <a href="#logout" onClick={(e) => { e.preventDefault(); handleLogout(); }}>
              Logout
            </a>
          ) : (
            <NavLink
              to="/login"
              onClick={() => setOpen(false)}
              className={({ isActive }) => (isActive ? 'active nav-cta' : 'nav-cta')}
            >
              Login
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
