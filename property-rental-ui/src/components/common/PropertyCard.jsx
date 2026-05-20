import React, { useState, useEffect, useContext } from 'react';
import { FaHeart, FaRegHeart, FaStar } from 'react-icons/fa';
import './PropertyCard.css';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

function PropertyCard({ property, onViewDetails, onApplyBooking }) {
  const { token } = useContext(AuthContext);
  const [isFavorited, setIsFavorited] = useState(false);

  const handleFavoriteClick = async () => {
    if (!token) return;

    try {
      const endpoint = isFavorited
        ? `${API_BASE_URL}/api/favorites/${property._id}`
        : `${API_BASE_URL}/api/favorites`;
      const method = isFavorited ? 'DELETE' : 'POST';
      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: isFavorited ? undefined : JSON.stringify({ propertyId: property._id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to favorite');
      }

      setIsFavorited((prev) => !prev);
    } catch (err) {
      console.error('Favorite error:', err.message);
    }
  };

  useEffect(() => {
    const checkFavorite = async () => {
      if (!token) {
        setIsFavorited(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/favorites`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) {
          setIsFavorited(false);
          return;
        }

        const hasFavorite = data.some((favoriteProperty) => favoriteProperty?._id === property._id);
        setIsFavorited(hasFavorite);
      } catch (err) {
        console.error('Error checking favorite:', err.message);
        setIsFavorited(false);
      }
    };
    if (property?._id) checkFavorite();
  }, [property?._id, token]);

  return (
    <div className="property-card">
      <img src={property.image || '/default-property.jpg'} alt={property.title} />
      <div className="property-info">
        <h3>{property.title}</h3>
        <p>{property.location}</p>
        <p>Rs. {property.price}/month</p>

        {property.ownerId?.ownerVerificationStatus === 'verified' && (
          <span className="verified-badge">Verified Owner</span>
        )}

        <div className="property-rating">
          {[...Array(5)].map((_, i) => (
            <FaStar
              key={i}
              color={i < Math.round(property.rating) ? '#FFD700' : '#ccc'}
            />
          ))}
          <span> ({property.numRatings || 0})</span>
        </div>

        <div className="property-actions">
          <div className="action-buttons">
            <button onClick={() => onViewDetails(property)}>View Details</button>
            <button onClick={() => onApplyBooking(property)}>Apply Booking</button>
          </div>
          <div
            className={`favorite-btn ${isFavorited ? 'favorited' : ''}`}
            onClick={handleFavoriteClick}
            role="button"
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleFavoriteClick()}
          >
            {isFavorited ? <FaHeart /> : <FaRegHeart />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PropertyCard;
