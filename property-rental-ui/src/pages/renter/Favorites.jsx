import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import PropertyDetails from '../../components/common/PropertyDetails';
import BookingPopup from '../../components/common/BookingPopup';
import './Favorites.css';

export default function Favorites() {
  const { token } = useContext(AuthContext);
  const [favorites, setFavorites] = useState([]);
  const [error, setError] = useState('');
  const [viewDetailsId, setViewDetailsId] = useState(null);
  const [bookingProperty, setBookingProperty] = useState(null);
  const validFavorites = favorites.filter(Boolean);

  useEffect(() => {
    const fetchFavorites = async () => {
      try {
        if (!token) {
          setError('Please log in to view favorites.');
          return;
        }

        const res = await fetch(`${API_BASE_URL}/api/favorites`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load favorites');
        setFavorites(data);
      } catch (err) {
        setError(err.message);
      }
    };

    fetchFavorites();
  }, [token]);

  const removeFavorite = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/favorites/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFavorites((prev) => prev.filter((p) => p && p._id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="favorites-container">
      <h1>My Favorites</h1>
      {error && <p className="error">{error}</p>}
      {validFavorites.length === 0 ? (
        <p>No favorite properties found.</p>
      ) : (
        <div className="favorites-grid">
          {validFavorites.map((property) => (
            <div className="favorite-card" key={property._id}>
              <img
                src={property.image || '/default-image.jpg'}
                alt={property.title || 'Property image'}
              />
              <h3>{property.title}</h3>
              <p>Location: {property.location}</p>
              <p>Price: Rs. {property.price}</p>
              <div className="favorite-actions">
                <button className="btn-primary" onClick={() => setViewDetailsId(property._id)}>
                  View Details
                </button>
                <button className="btn-primary" onClick={() => setBookingProperty(property)}>
                  Apply Booking
                </button>
                <button className="btn-danger" onClick={() => removeFavorite(property._id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewDetailsId && (
        <div className="modal-overlay" onClick={() => setViewDetailsId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setViewDetailsId(null)}
              aria-label="Close popup"
              title="Close"
            >
              ✕
            </button>
            <PropertyDetails id={viewDetailsId} />
          </div>
        </div>
      )}

      {bookingProperty && (
        <BookingPopup property={bookingProperty} onClose={() => setBookingProperty(null)} />
      )}
    </div>
  );
}
