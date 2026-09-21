import { useEffect } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth.jsx';
import { GravesProvider } from './graves.jsx';
import { ToastProvider } from './ui.jsx';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import FindGrave from './pages/FindGrave.jsx';
import GraveDetail from './pages/GraveDetail.jsx';
import About from './pages/About.jsx';
import Services from './pages/Services.jsx';
import Contact from './pages/Contact.jsx';
import Admin from './pages/Admin.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="container" style={{ padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 64 }}>🕊️</div>
      <h1 className="serif">Page not found</h1>
      <p style={{ color: 'var(--muted)' }}>The page you are looking for has moved or no longer exists.</p>
      <Link className="btn btn-pine" to="/">Back to home</Link>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <GravesProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Navbar />
            <main style={{ minHeight: 'calc(100vh - 68px)' }}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/find" element={<FindGrave />} />
                <Route path="/grave/:id" element={<GraveDetail />} />
                <Route path="/about" element={<About />} />
                <Route path="/services" element={<Services />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
            <Footer />
          </BrowserRouter>
        </GravesProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
