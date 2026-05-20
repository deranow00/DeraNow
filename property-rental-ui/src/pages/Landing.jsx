import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import './Landing.css';

function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="landing-wrap nav-inner">
        <a className="brand" href="#home">Property Rental</a>
        <button className="menu-btn" onClick={() => setOpen((p) => !p)} aria-label="Toggle menu">
          <span />
          <span />
          <span />
        </button>
        <nav className={`nav-links ${open ? 'open' : ''}`}>
          <a href="#home" onClick={() => setOpen(false)}>Home</a>
          <a href="#featured" onClick={() => setOpen(false)}>Featured</a>
          <a href="#ops" onClick={() => setOpen(false)}>Operations</a>
          <a href="#how" onClick={() => setOpen(false)}>How It Works</a>
          <a href="#security" onClick={() => setOpen(false)}>Security</a>
          <a href="#faq" onClick={() => setOpen(false)}>FAQ</a>
          <Link to="/login" onClick={() => setOpen(false)}>Login</Link>
          <Link to="/register" className="nav-cta" onClick={() => setOpen(false)}>Get Started</Link>
        </nav>
      </div>
    </header>
  );
}

function Hero({ totalProperties, featuredCount, onSearch }) {
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState('');

  const submit = (e) => {
    e.preventDefault();
    onSearch({ q, location, type });
  };

  return (
    <section id="home" className="hero-section">
      <div className="hero-bg-shape hero-bg-shape-a" />
      <div className="hero-bg-shape hero-bg-shape-b" />
      <div className="landing-wrap hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Verified Rentals</p>
          <h1>Find A Reliable Property In Minutes</h1>
          <p>
            Search approved listings, compare prices, and book with secure payment tracking.
            Built for renters and owners with a clean workflow.
          </p>
          <form className="hero-search" onSubmit={submit}>
            <input
              type="text"
              placeholder="Search title or keyword"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <input
              type="text"
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              <option value="Apartment">Apartment</option>
              <option value="House">House</option>
              <option value="Condo">Condo</option>
            </select>
            <button type="submit">Search Listings</button>
          </form>
          <div className="hero-stats">
            <div>
              <strong>{totalProperties}</strong>
              <span>Listed Properties</span>
            </div>
            <div>
              <strong>{featuredCount}</strong>
              <span>Featured Now</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>Support Flow</span>
            </div>
          </div>
        </div>
        <div className="hero-panel">
          <h3>Platform Highlights</h3>
          <ul>
            <li>Advanced filters for price, bedrooms, bathrooms, and type</li>
            <li>Review and rating support with owner verification badges</li>
            <li>Real-time chat with typing indicators and read receipts</li>
            <li>Invoice-ready payment history and status tracking</li>
          </ul>
          <Link to="/register" className="hero-panel-btn">Create Account</Link>
        </div>
      </div>
    </section>
  );
}

function Featured({ listings, loading, error }) {
  return (
    <section id="featured" className="featured-section">
      <div className="landing-wrap">
        <div className="section-head">
          <h2>Featured Listings</h2>
          <p>Live data from newly listed properties in the backend.</p>
        </div>
        {loading && <p className="status-box">Loading featured listings...</p>}
        {error && <p className="status-box error">{error}</p>}
        {!loading && !error && listings.length === 0 && (
          <p className="status-box">No listed properties available yet.</p>
        )}
        {!loading && !error && listings.length > 0 && (
          <div className="featured-grid">
            {listings.map((item) => (
              <article className="featured-card" key={item._id}>
                <div className="featured-image-wrap">
                  <img src={item.image || '/default-property.jpg'} alt={item.title} />
                  <span className="price-chip">Rs. {item.price}/month</span>
                </div>
                <div className="featured-body">
                  <h3>{item.title}</h3>
                  <p className="meta">{item.location}</p>
                  <p className="meta">{item.type} · {item.bedrooms} bed · {item.bathrooms} bath</p>
                  <p className="meta">Rating: {Number(item.rating || 0).toFixed(1)} ({item.numRatings || 0})</p>
                  <div className="card-actions">
                    <Link to={`/property/${item._id}`}>View Details</Link>
                    <Link to="/login" className="secondary">Login To Rent</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = [
    'KYC-backed profiles',
    'Approval-first listings',
    'Document-ready invoices',
    'Role-based dashboards',
    'Live chat and notifications',
  ];

  return (
    <section className="trust-strip">
      <div className="landing-wrap trust-strip-inner">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}

function ValuePillars() {
  const pillars = [
    {
      title: 'Reliability',
      text: 'Verification workflows and staged approvals reduce fraudulent listings and risky bookings.',
    },
    {
      title: 'Transparency',
      text: 'Payment status, agreements, and booking events stay visible in one accountable trail.',
    },
    {
      title: 'Operational Control',
      text: 'Owners and renters get role-specific tools without complexity overload.',
    },
    {
      title: 'Scalable Workflow',
      text: 'From first listing to move-in, each step is structured for consistent execution.',
    },
  ];

  return (
    <section className="pillars-section">
      <div className="landing-wrap">
        <div className="section-head">
          <h2>Why Teams Trust This Platform</h2>
          <p>Designed for practical rental operations, not demo-only features.</p>
        </div>
        <div className="pillars-grid">
          {pillars.map((pillar, index) => (
            <article className="pillar-card" key={pillar.title} style={{ animationDelay: `${index * 60}ms` }}>
              <h3>{pillar.title}</h3>
              <p>{pillar.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function OpsSnapshot({ pool }) {
  const metrics = useMemo(() => {
    const total = pool.length;
    const avgPrice = total
      ? Math.round(pool.reduce((sum, item) => sum + Number(item.price || 0), 0) / total)
      : 0;
    const avgRatingRaw = total
      ? pool.reduce((sum, item) => sum + Number(item.rating || 0), 0) / total
      : 0;
    const avgRating = Number(avgRatingRaw || 0).toFixed(1);
    const verifiedOwners = pool.filter((item) => item.owner?.ownerVerificationStatus === 'verified').length;
    return { total, avgPrice, avgRating, verifiedOwners };
  }, [pool]);

  return (
    <section id="ops" className="ops-section">
      <div className="landing-wrap">
        <div className="section-head">
          <h2>Operational Snapshot</h2>
          <p>Real listing-derived signals to support faster rental decisions.</p>
        </div>
        <div className="ops-grid">
          <article className="ops-card">
            <span>Active Listing Pool</span>
            <strong>{metrics.total}</strong>
          </article>
          <article className="ops-card">
            <span>Average Monthly Price</span>
            <strong>Rs. {metrics.avgPrice || 0}</strong>
          </article>
          <article className="ops-card">
            <span>Average Rating</span>
            <strong>{metrics.avgRating}</strong>
          </article>
          <article className="ops-card">
            <span>Verified Owner Listings</span>
            <strong>{metrics.verifiedOwners}</strong>
          </article>
        </div>
      </div>
    </section>
  );
}

function SearchResults({ listings, loading, error, searched }) {
  if (!searched) return null;

  return (
    <section id="search-results" className="featured-section search-results-section">
      <div className="landing-wrap">
        <div className="section-head">
          <h2>Search Results</h2>
          <p>Available properties matching your search.</p>
        </div>
        {loading && <p className="status-box">Searching available properties...</p>}
        {error && <p className="status-box error">{error}</p>}
        {!loading && !error && listings.length === 0 && (
          <p className="status-box">No available properties match your search.</p>
        )}
        {!loading && !error && listings.length > 0 && (
          <div className="featured-grid">
            {listings.map((item) => (
              <article className="featured-card" key={item._id}>
                <div className="featured-image-wrap">
                  <img src={item.image || '/default-property.jpg'} alt={item.title} />
                  <span className="price-chip">Rs. {item.price}/month</span>
                </div>
                <div className="featured-body">
                  <h3>{item.title}</h3>
                  <p className="meta">{item.location}</p>
                  <p className="meta">{item.type} · {item.bedrooms} bed · {item.bathrooms} bath</p>
                  <p className="meta">Rating: {Number(item.rating || 0).toFixed(1)} ({item.numRatings || 0})</p>
                  <div className="card-actions">
                    <Link to={`/property/${item._id}`}>View Details</Link>
                    <Link to="/login" className="secondary">Login To Book</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = useMemo(
    () => [
      {
        title: 'Search Fast',
        text: 'Use homepage search and filters to target relevant properties immediately.',
      },
      {
        title: 'Review Trust Signals',
        text: 'Check owner verification state, ratings, and review comments before booking.',
      },
      {
        title: 'Book And Track',
        text: 'Submit booking requests, pay securely, and download invoice-ready payment records.',
      },
    ],
    []
  );

  return (
    <section id="how" className="how-section">
      <div className="landing-wrap">
        <div className="section-head">
          <h2>How It Works</h2>
          <p>Simple flow designed for production use.</p>
        </div>
        <div className="steps-grid">
          {steps.map((step, i) => (
            <div className="step-card" key={step.title}>
              <span className="step-index">0{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowDetail() {
  const phases = [
    {
      title: 'Discovery',
      text: 'Filtered search and shortlist generation using location, budget, and property type.',
    },
    {
      title: 'Qualification',
      text: 'Trust checks via profile verification, owner history, and listing-level context.',
    },
    {
      title: 'Commitment',
      text: 'Booking request with structured state transitions and agreement tracking.',
    },
    {
      title: 'Settlement',
      text: 'Payment capture, invoice generation, and status-level transparency.',
    },
    {
      title: 'Occupancy',
      text: 'Move-in readiness with records and communication continuity.',
    },
  ];

  return (
    <section className="workflow-section">
      <div className="landing-wrap">
        <div className="section-head">
          <h2>End-To-End Workflow</h2>
          <p>Every stage is explicit, traceable, and aligned with real rental operations.</p>
        </div>
        <div className="workflow-grid">
          {phases.map((phase, index) => (
            <article className="workflow-card" key={phase.title}>
              <div className="workflow-index">{index + 1}</div>
              <div>
                <h3>{phase.title}</h3>
                <p>{phase.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function AudienceFlows() {
  return (
    <section className="audience-section">
      <div className="landing-wrap audience-grid">
        <article className="audience-card">
          <h3>For Renters</h3>
          <ul>
            <li>Search by location, type, and budget in seconds.</li>
            <li>Compare trust signals: ratings, owner status, and listing details.</li>
            <li>Track payment and booking progression in one place.</li>
            <li>Use chat to resolve pre-booking questions quickly.</li>
          </ul>
          <Link to="/register" className="audience-link">Start As Renter</Link>
        </article>
        <article className="audience-card">
          <h3>For Owners</h3>
          <ul>
            <li>Publish and manage listings with approval-ready details.</li>
            <li>Handle booking requests using structured workflow states.</li>
            <li>Monitor payment status and agreement readiness.</li>
            <li>Respond to renter messages and complaints with context.</li>
          </ul>
          <Link to="/register" className="audience-link">Start As Owner</Link>
        </article>
      </div>
    </section>
  );
}

function SocialProof() {
  const quotes = [
    {
      name: 'Rental Ops Team',
      text: 'The booking-to-payment flow is now predictable and easy to audit.',
    },
    {
      name: 'Verified Owner',
      text: 'Listing management feels cleaner, and communication with renters is faster.',
    },
    {
      name: 'Frequent Renter',
      text: 'I can evaluate properties faster because trust and pricing details are clear.',
    },
  ];

  return (
    <section className="social-proof-section">
      <div className="landing-wrap">
        <div className="section-head">
          <h2>Proof Of Practical Value</h2>
          <p>Built around repeatable rental operations with measurable clarity.</p>
        </div>
        <div className="quote-grid">
          {quotes.map((quote) => (
            <blockquote className="quote-card" key={quote.name}>
              <p>{quote.text}</p>
              <footer>{quote.name}</footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

function SecurityBlock() {
  const points = [
    'Environment-based API and CORS control for deploy safety',
    'Role-separated dashboards and route guards',
    'OTP-backed email verification flow',
    'Audit-ready booking/payment history trail',
  ];
  return (
    <section id="security" className="security-section">
      <div className="landing-wrap security-grid">
        <div>
          <h2>Security and Compliance Foundations</h2>
          <p>
            Production-ready systems require controlled access, clear traces, and predictable data behavior.
            This platform emphasizes practical safeguards that scale with operational growth.
          </p>
        </div>
        <ul>
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="faq-section">
      <div className="landing-wrap faq-grid">
        <div>
          <h2>Common Questions</h2>
          <p>Quick answers about search, booking, and payment.</p>
        </div>
        <div className="faq-list">
          <details>
            <summary>Are listings verified before public visibility?</summary>
            <p>Yes. Listings move through admin approval and are exposed as approved records.</p>
          </details>
          <details>
            <summary>Can I track payment and invoices?</summary>
            <p>Yes. Payment history stores status and invoice data per booking transaction.</p>
          </details>
          <details>
            <summary>Does messaging support real-time indicators?</summary>
            <p>Yes. Typing indicators and read receipts are supported in chat.</p>
          </details>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="landing-footer">
      <div className="landing-wrap footer-inner">
        <div>
          <h4>Property Rental</h4>
          <p>Operational rental platform for owners and renters.</p>
        </div>
        <div className="footer-links">
          <Link to="/register">Create Account</Link>
          <Link to="/login">Login</Link>
          <a href="#featured">Featured</a>
          <a href="#ops">Operations</a>
          <a href="#security">Security</a>
        </div>
      </div>
    </footer>
  );
}

function FinalCta() {
  return (
    <section className="final-cta">
      <div className="landing-wrap final-cta-inner">
        <div>
          <h2>Launch Your Next Rental Decision With Confidence</h2>
          <p>Join a workflow that stays clear from listing to move-in.</p>
        </div>
        <div className="final-cta-actions">
          <Link to="/register" className="final-cta-primary">Create Account</Link>
          <Link to="/login" className="final-cta-secondary">Sign In</Link>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const [featured, setFeatured] = useState([]);
  const [searchPool, setSearchPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');

    return () => {
      if (previousTheme) root.setAttribute('data-theme', previousTheme);
      else root.removeAttribute('data-theme');
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadFeatured = async () => {
      try {
        setLoading(true);
        const [pendingRes, approvedRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/properties?status=Pending&sort=newest`),
          fetch(`${API_BASE_URL}/api/properties?status=Approved&sort=newest`),
        ]);
        const pendingData = await pendingRes.json();
        const approvedData = await approvedRes.json();
        if (!pendingRes.ok) throw new Error(pendingData.error || 'Failed to load listings');
        if (!approvedRes.ok) throw new Error(approvedData.error || 'Failed to load listings');
        if (active) {
          setFeatured(Array.isArray(pendingData) ? pendingData.slice(0, 6) : []);

          const combined = [...(approvedData || []), ...(pendingData || [])];
          const byId = new Map();
          combined.forEach((item) => byId.set(item._id, item));
          setSearchPool(Array.from(byId.values()));
        }
      } catch (err) {
        if (active) setError(err.message || 'Failed to load featured listings');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadFeatured();
    return () => {
      active = false;
    };
  }, []);

  const handleSearch = async ({ q, location, type }) => {
    setSearchLoading(true);
    setSearchError('');
    setSearched(true);

    try {
      let pool = searchPool;
      if (!searchPool.length) {
        const [pendingRes, approvedRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/properties?status=Pending&sort=newest`),
          fetch(`${API_BASE_URL}/api/properties?status=Approved&sort=newest`),
        ]);
        const pendingData = await pendingRes.json();
        const approvedData = await approvedRes.json();
        const combined = [...(approvedData || []), ...(pendingData || [])];
        const byId = new Map();
        combined.forEach((item) => byId.set(item._id, item));
        pool = Array.from(byId.values());
        setSearchPool(pool);
      }

      const term = q.trim().toLowerCase();
      const loc = location.trim().toLowerCase();
      const results = pool.filter((item) => {
        const matchesTerm =
          !term ||
          item.title?.toLowerCase().includes(term) ||
          item.location?.toLowerCase().includes(term) ||
          item.description?.toLowerCase().includes(term);
        const matchesLocation = !loc || item.location?.toLowerCase().includes(loc);
        const matchesType = !type || item.type === type;
        const notRejected = item.status !== 'Rejected';
        return matchesTerm && matchesLocation && matchesType && notRejected;
      });
      setSearchResults(results);
      window.requestAnimationFrame(() => {
        const section = document.getElementById('search-results');
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    } catch (err) {
      setSearchError(err.message || 'Failed to search properties');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="landing-page">
      <Navbar />
      <Hero totalProperties={featured.length} featuredCount={Math.min(featured.length, 6)} onSearch={handleSearch} />
      <TrustStrip />
      <SearchResults listings={searchResults} loading={searchLoading} error={searchError} searched={searched} />
      <Featured listings={featured} loading={loading} error={error} />
      <ValuePillars />
      <OpsSnapshot pool={searchPool} />
      <HowItWorks />
      <WorkflowDetail />
      <AudienceFlows />
      <SocialProof />
      <SecurityBlock />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}
