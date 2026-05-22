import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import './Landing.css';

const displayRentalType = (type) => (type === 'Condo' ? 'Room' : type);

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
        <a className="brand" href="#home">DeraNow</a>
        <button className="menu-btn" onClick={() => setOpen((p) => !p)} aria-label="Toggle menu">
          <span />
          <span />
          <span />
        </button>
        <nav className={`nav-links ${open ? 'open' : ''}`}>
          <a href="#home" onClick={() => setOpen(false)}>Home</a>
          <a href="#featured" onClick={() => setOpen(false)}>Listings</a>
          <a href="#renters" onClick={() => setOpen(false)}>For Renters</a>
          <a href="#how" onClick={() => setOpen(false)}>How It Works</a>
          <a href="#security" onClick={() => setOpen(false)}>Trust</a>
          <a href="#faq" onClick={() => setOpen(false)}>FAQ</a>
          <Link to="/login" onClick={() => setOpen(false)}>Login</Link>
          <Link to="/register" className="nav-cta" onClick={() => setOpen(false)}>Create Account</Link>
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
          <p className="eyebrow">DeraNow Verified Rentals</p>
          <h1>Find verified rooms, flats, and houses</h1>
          <p>
            Search approved listings, compare prices, message owners, and manage every
            step from booking request to payment record in one trusted place.
          </p>
          <form className="hero-search" onSubmit={submit}>
            <input
              type="text"
              placeholder="Search room, flat, house..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <input
              type="text"
              placeholder="City or area"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              <option value="Apartment">Apartment</option>
              <option value="House">House</option>
              <option value="Condo">Room</option>
            </select>
            <button type="submit">Find Rentals</button>
          </form>
          <div className="hero-stats">
            <div>
              <strong>{totalProperties}</strong>
              <span>Approved Listings</span>
            </div>
            <div>
              <strong>{featuredCount}</strong>
              <span>Featured Rentals</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>Live Updates</span>
            </div>
          </div>
        </div>
        <div className="hero-panel">
          <h3>Why renters and owners use DeraNow</h3>
          <ul>
            <li>Approved listings with clear location, rent, and room details</li>
            <li>Owner verification, renter profiles, ratings, and reviews</li>
            <li>Real-time chat, notifications, and booking status updates</li>
            <li>Payment records, invoices, agreements, and document storage</li>
          </ul>
          <Link to="/register" className="hero-panel-btn">Start With DeraNow</Link>
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
          <h2>Featured Rentals</h2>
          <p>Approved rooms, flats, and houses currently available on DeraNow.</p>
        </div>
        {loading && <p className="status-box">Loading featured listings...</p>}
        {error && <p className="status-box error">{error}</p>}
        {!loading && !error && listings.length === 0 && (
          <p className="status-box">No approved listings are available yet.</p>
        )}
        {!loading && !error && listings.length > 0 && (
          <div className="featured-grid">
            {listings.map((item) => (
              <article className="featured-card" key={item._id}>
                <div className="featured-image-wrap">
                  <img src={item.image || '/property.png'} alt={item.title} />
                  <span className="price-chip">Rs. {item.price}/month</span>
                </div>
                <div className="featured-body">
                  <h3>{item.title}</h3>
                  <p className="meta">{item.location}</p>
                  <p className="meta">{displayRentalType(item.type)} · {item.bedrooms} bed · {item.bathrooms} bath</p>
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

function TrustStrip() {
  const items = [
    'Verified renter and owner profiles',
    'Approved public listings',
    'Invoice-ready payment records',
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
      title: 'Verified Access',
      text: 'Email verification, owner review, and KYC-aware profiles help keep rental activity accountable.',
    },
    {
      title: 'Clear Decisions',
      text: 'Renters can compare price, location, property type, ratings, and owner details before booking.',
    },
    {
      title: 'Owner Control',
      text: 'Owners manage listings, booking requests, agreements, messages, and payments from one dashboard.',
    },
    {
      title: 'Complete Records',
      text: 'Bookings, payments, invoices, documents, and complaints remain traceable after move-in.',
    },
  ];

  return (
    <section className="pillars-section">
      <div className="landing-wrap">
        <div className="section-head">
          <h2>Built for real rental decisions</h2>
          <p>DeraNow keeps renters, owners, and rental records aligned from first search to move-in.</p>
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
          <h2>Rental market snapshot</h2>
          <p>Live signals from approved DeraNow listings.</p>
        </div>
        <div className="ops-grid">
          <article className="ops-card">
            <span>Approved Listings</span>
            <strong>{metrics.total}</strong>
          </article>
          <article className="ops-card">
            <span>Average Monthly Rent</span>
            <strong>Rs. {metrics.avgPrice || 0}</strong>
          </article>
          <article className="ops-card">
            <span>Average Rating</span>
            <strong>{metrics.avgRating}</strong>
          </article>
          <article className="ops-card">
            <span>Verified Owners</span>
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
          <p>Approved rentals matching your search.</p>
        </div>
        {loading && <p className="status-box">Searching approved rentals...</p>}
        {error && <p className="status-box error">{error}</p>}
        {!loading && !error && listings.length === 0 && (
          <p className="status-box">No approved rentals match your search.</p>
        )}
        {!loading && !error && listings.length > 0 && (
          <div className="featured-grid">
            {listings.map((item) => (
              <article className="featured-card" key={item._id}>
                <div className="featured-image-wrap">
                  <img src={item.image || '/property.png'} alt={item.title} />
                  <span className="price-chip">Rs. {item.price}/month</span>
                </div>
                <div className="featured-body">
                  <h3>{item.title}</h3>
                  <p className="meta">{item.location}</p>
                  <p className="meta">{displayRentalType(item.type)} · {item.bedrooms} bed · {item.bathrooms} bath</p>
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
        title: 'Search',
        text: 'Filter by area, rent, and property type to find rooms, flats, and houses that match your needs.',
      },
      {
        title: 'Compare',
        text: 'Review listing details, owner status, ratings, and pricing before you send a booking request.',
      },
      {
        title: 'Book And Manage',
        text: 'Track requests, payments, agreements, and messages from your DeraNow dashboard.',
      },
    ],
    []
  );

  return (
    <section id="how" className="how-section">
      <div className="landing-wrap">
        <div className="section-head">
          <h2>How DeraNow works</h2>
          <p>A clear rental process for both renters and owners.</p>
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
      title: 'Discover',
      text: 'Search by location, budget, and rental type.',
    },
    {
      title: 'Evaluate',
      text: 'Check listing details, ratings, owner status, and photos.',
    },
    {
      title: 'Request',
      text: 'Send a booking request and follow its status.',
    },
    {
      title: 'Pay',
      text: 'Track payment status and invoice records.',
    },
    {
      title: 'Move In',
      text: 'Keep agreements, documents, and messages available after approval.',
    },
  ];

  return (
    <section className="workflow-section">
      <div className="landing-wrap">
        <div className="section-head">
          <h2>From search to move-in</h2>
          <p>DeraNow keeps each rental step visible and easy to follow.</p>
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
    <section id="renters" className="audience-section">
      <div className="landing-wrap audience-grid">
        <article className="audience-card">
          <h3>For Renters</h3>
          <ul>
            <li>Find rooms, flats, and houses by location, type, and budget.</li>
            <li>Compare ratings, owner status, rent, and listing details.</li>
            <li>Track booking requests, payments, agreements, and documents.</li>
            <li>Message owners before and after booking.</li>
          </ul>
          <Link to="/register" className="audience-link">Start As Renter</Link>
        </article>
        <article className="audience-card">
          <h3>For Owners</h3>
          <ul>
            <li>Publish rooms, flats, and houses with complete listing details.</li>
            <li>Review booking requests and communicate with renters.</li>
            <li>Monitor payment status, invoices, agreements, and documents.</li>
            <li>Keep complaints and renter communication organized.</li>
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
      name: 'Renter',
      text: 'DeraNow makes it easier to compare rentals and understand the next step before booking.',
    },
    {
      name: 'Owner',
      text: 'Listings, requests, payments, and renter messages stay organized in one dashboard.',
    },
    {
      name: 'Admin',
      text: 'Approved listings and verification flows help maintain trust across the platform.',
    },
  ];

  return (
    <section className="social-proof-section">
      <div className="landing-wrap">
        <div className="section-head">
          <h2>Designed around daily rental work</h2>
          <p>Practical tools for the people searching, listing, approving, and managing rentals.</p>
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
    'OTP-backed email verification for new accounts',
    'Role-based renter, owner, and admin access',
    'Owner verification and approval-first listing visibility',
    'Traceable booking, payment, agreement, and complaint records',
  ];
  return (
    <section id="security" className="security-section">
      <div className="landing-wrap security-grid">
        <div>
          <h2>Trust and safety built in</h2>
          <p>
            DeraNow is built around verified accounts, controlled listing visibility, and clear
            rental records so both renters and owners can move with confidence.
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
          <p>Quick answers about listings, booking, and payments.</p>
        </div>
        <div className="faq-list">
          <details>
            <summary>Are listings reviewed before renters see them?</summary>
            <p>Yes. Public listing sections use approved listings so renters see reviewed rental options.</p>
          </details>
          <details>
            <summary>Can I track payments and invoices?</summary>
            <p>Yes. DeraNow keeps payment status and invoice data attached to each booking.</p>
          </details>
          <details>
            <summary>Can renters and owners message each other?</summary>
            <p>Yes. Built-in chat supports quick communication around listings, booking, and move-in details.</p>
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
          <h4>DeraNow</h4>
          <p>Verified rooms, flats, and houses with booking, payments, agreements, and messaging.</p>
        </div>
        <div className="footer-links">
          <Link to="/register">Create Account</Link>
          <Link to="/login">Login</Link>
          <a href="#featured">Listings</a>
          <a href="#renters">For Renters</a>
          <a href="#security">Trust</a>
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
          <h2>Find or manage your next rental with DeraNow</h2>
          <p>Create an account to search approved rentals, list your property, and manage bookings with clarity.</p>
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
        const approvedRes = await fetch(`${API_BASE_URL}/api/properties?status=Approved&sort=newest`);
        const approvedData = await approvedRes.json();
        if (!approvedRes.ok) throw new Error(approvedData.error || 'Failed to load listings');
        if (active) {
          const approvedListings = Array.isArray(approvedData) ? approvedData : [];
          setFeatured(approvedListings.slice(0, 6));
          setSearchPool(approvedListings);
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
        const approvedRes = await fetch(`${API_BASE_URL}/api/properties?status=Approved&sort=newest`);
        const approvedData = await approvedRes.json();
        if (!approvedRes.ok) throw new Error(approvedData.error || 'Failed to search rentals');
        pool = Array.isArray(approvedData) ? approvedData : [];
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
        const isApproved = item.status === 'Approved';
        return matchesTerm && matchesLocation && matchesType && isApproved;
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
