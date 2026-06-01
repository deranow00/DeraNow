import React, { useEffect, useState, useContext } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
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
  const [activeImages, setActiveImages] = useState({});
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

  const getGalleryImages = (property) => (
    Array.isArray(property.images) && property.images.length
      ? property.images
      : [property.image || '/default-property.jpg']
  );

  const showPreviousImage = (propertyId, total) => {
    setActiveImages((prev) => ({
      ...prev,
      [propertyId]: (prev[propertyId] || 0) === 0 ? total - 1 : (prev[propertyId] || 0) - 1,
    }));
  };

  const showNextImage = (propertyId, total) => {
    setActiveImages((prev) => ({
      ...prev,
      [propertyId]: ((prev[propertyId] || 0) + 1) % total,
    }));
  };

  return (
    <div className="favorites-container">
      <h1>My Favorites</h1>
      {error && <p className="error">{error}</p>}
      {validFavorites.length === 0 ? (
        <p>No favorite properties found.</p>
      ) : (
        <div className="favorites-grid">
          {validFavorites.map((property) => {
            const galleryImages = getGalleryImages(property);
            const activeIndex = Math.min(activeImages[property._id] || 0, galleryImages.length - 1);
            const activeImage = galleryImages[activeIndex] || '/default-property.jpg';

            return (
              <div className="favorite-card" key={property._id}>
                <div className="favorite-card-slider">
                  <img
                    src={activeImage}
                    alt={`${property.title || 'Property'} photo ${activeIndex + 1}`}
                  />
                  {galleryImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="favorite-slide-btn prev"
                        onClick={() => showPreviousImage(property._id, galleryImages.length)}
                        aria-label="Previous property photo"
                      >
                        <FaChevronLeft aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="favorite-slide-btn next"
                        onClick={() => showNextImage(property._id, galleryImages.length)}
                        aria-label="Next property photo"
                      >
                        <FaChevronRight aria-hidden="true" />
                      </button>
                      <span className="favorite-slide-count">{activeIndex + 1} / {galleryImages.length}</span>
                      <div className="favorite-slide-dots" aria-label="Property photo position">
                        {galleryImages.map((imageUrl, index) => (
                          <button
                            type="button"
                            key={`${imageUrl}-${index}`}
                            className={index === activeIndex ? 'active' : ''}
                            onClick={() => setActiveImages((prev) => ({ ...prev, [property._id]: index }))}
                            aria-label={`Show photo ${index + 1}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
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
            );
          })}
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
