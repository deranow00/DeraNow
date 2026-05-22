import { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PropertyCard from '../../components/common/PropertyCard';
import PropertyDetails from '../../components/common/PropertyDetails';
import BookingPopup from '../../components/common/BookingPopup';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './Home.css';

const getAreaKey = (location = '') =>
  String(location)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)[0]
    ?.toLowerCase() || '';

export default function RenterHome() {
  const { user } = useContext(AuthContext);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDetailsId, setShowDetailsId] = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const loadProperties = async () => {
      try {
        setLoading(true);
        setError('');
        const params = new URLSearchParams({
          status: 'Approved',
          availableOnly: 'true',
          sort: 'newest',
        });
        const res = await fetch(`${API_BASE_URL}/api/properties?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load properties');
        if (active) setProperties(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (active) setError(err.message || 'Failed to load properties');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProperties();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const featuredProperties = useMemo(() => {
    return [...properties]
      .sort((a, b) => {
        const ratingDelta = Number(b.rating || 0) - Number(a.rating || 0);
        if (ratingDelta) return ratingDelta;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      })
      .slice(0, 6);
  }, [properties]);

  const nearbyProperties = useMemo(() => {
    const featuredIds = new Set(featuredProperties.map((property) => property._id));
    const areaCounts = properties.reduce((acc, property) => {
      const key = getAreaKey(property.location);
      if (key) acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const nearbyArea = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const nearby = properties.filter((property) => {
      if (featuredIds.has(property._id)) return false;
      if (!nearbyArea) return true;
      return getAreaKey(property.location) === nearbyArea;
    });
    const fallback = properties.filter((property) => !featuredIds.has(property._id));
    return (nearby.length ? nearby : fallback.length ? fallback : properties).slice(0, 6);
  }, [featuredProperties, properties]);

  const closeDetailsModal = () => setShowDetailsId(null);
  const openBookingPopup = (property) => setSelectedProperty(property);
  const closeBookingPopup = () => setSelectedProperty(null);

  const renderPropertyGrid = (items) => {
    if (loading) {
      return (
        <div className="home-property-grid">
          {[1, 2, 3].map((item) => (
            <div className="home-property-skeleton" key={item} />
          ))}
        </div>
      );
    }

    if (error) return <p className="home-state error">{error}</p>;
    if (!items.length) return <p className="home-state">No approved properties are available right now.</p>;

    return (
      <div className="home-property-grid">
        {items.map((property) => (
          <PropertyCard
            key={property._id}
            property={property}
            onViewDetails={() => setShowDetailsId(property._id)}
            onApplyBooking={() => openBookingPopup(property)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="renter-home">
      <section className="renter-home-hero">
        <div>
          <p className="home-eyebrow">DeraNow renter home</p>
          <h2>Find your next room, flat, or house</h2>
          <p>
            Welcome{user?.name ? `, ${user.name}` : ''}. Browse featured rentals, explore nearby
            options, and book approved properties from one place.
          </p>
        </div>
        <div className="home-hero-actions">
          <Link to="/renter/listings" className="home-primary-link">Browse all listings</Link>
          <Link to="/renter/favorites" className="home-secondary-link">View favorites</Link>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <div>
            <h3>Featured properties</h3>
            <p>Highly rated and recently added rentals available for booking.</p>
          </div>
          <Link to="/renter/listings">See all</Link>
        </div>
        {renderPropertyGrid(featuredProperties)}
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <div>
            <h3>Nearby properties</h3>
            <p>More approved rentals from active DeraNow locations.</p>
          </div>
          <Link to="/renter/listings">Explore nearby</Link>
        </div>
        {renderPropertyGrid(nearbyProperties)}
      </section>

      {showDetailsId && (
        <div className="modal-overlay" onClick={closeDetailsModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeDetailsModal} aria-label="Close popup" title="Close">
              x
            </button>
            <PropertyDetails id={showDetailsId} />
          </div>
        </div>
      )}
      {selectedProperty && <BookingPopup property={selectedProperty} onClose={closeBookingPopup} />}
    </div>
  );
}
