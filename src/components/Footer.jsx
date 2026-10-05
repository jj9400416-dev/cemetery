import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <h4 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20 }}>Agnipa Memorial Park</h4>
          <p>
            A peaceful resting place in Agnipa, Romblon — kept with care so families can
            remember, visit, and honor their loved ones with dignity.
          </p>
        </div>
        <div>
          <h4>Explore</h4>
          <Link to="/">Home</Link>
          <Link to="/find">Find a Grave</Link>
          <Link to="/about">About</Link>
          <Link to="/services">Services & Hours</Link>
        </div>
        <div>
          <h4>Support</h4>
          <Link to="/contact">Contact Us</Link>
          <Link to="/services">Rules & Regulations</Link>
          <Link to="/admin-login">Admin Login</Link>
        </div>
        <div>
          <h4>Visit Us</h4>
          <p style={{ margin: '0 0 9px' }}>Agnipa, Romblon, Philippines</p>
          <p style={{ margin: '0 0 9px' }}>Open daily · 6:00 AM – 6:00 PM</p>
          <p style={{ margin: 0 }}>Main Entrance: south side of the park</p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Agnipa Memorial Park. All rights reserved.</span>
        <span>Built for the families of Agnipa, Romblon.</span>
      </div>
    </footer>
  );
}
