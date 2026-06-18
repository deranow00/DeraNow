import React, { useState, useEffect, useContext } from 'react';
import { FaChevronLeft, FaChevronRight, FaHeart, FaRegHeart, FaStar } from 'react-icons/fa';
import './PropertyCard.css';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

const parkingLabel = (type, available) => {
  if (type === 'bike') return 'Bike parking';
  if (type === 'car') return 'Car parking';
  if (type === 'both') return 'Car & bike parking';
  return available ? 'Parking' : 'No parking';
};

function PropertyCard({ property, onViewDetails, onApplyBooking }) {
  const { token } = useContext(AuthContext);
  const [isFavorited, setIsFavorited] = useState(false);
  const displayType = property.type === 'Condo' ? 'Room' : property.type;
  const galleryImages = Array.isArray(property.images) && property.images.length
    ? property.images
    : [property.image || '/default-property.jpg'];
  const galleryLabels = Array.isArray(property.imageLabels) ? property.imageLabels : [];
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const activeImage = galleryImages[activeImageIndex] || galleryImages[0] || '/default-property.jpg';
  const activeImageLabel = galleryLabels[activeImageIndex] || `Photo ${activeImageIndex + 1}`;
  const availabilityStatus = property.availabilityStatus || property.bookingStatus || 'Available';
  const availabilityClass = availabilityStatus.toLowerCase().replace(/\s+/g, '-');
  const isOccupied = availabilityStatus === 'Occupied';

  useEffect(() => {
    setActiveImageIndex(0);
  }, [property?._id]);

  const showPreviousImage = (event) => {
    event.stopPropagation();
    setActiveImageIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1));
  };

  const showNextImage = (event) => {
    event.stopPropagation();
    setActiveImageIndex((prev) => (prev + 1) % galleryImages.length);
  };

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
      <div className="property-card-slider">
        <img src={activeImage} alt={property.title} />
        <span className="property-image-label">{activeImageLabel}</span>
        {galleryImages.length > 1 && (
          <>
            <button type="button" className="property-slide-btn prev" onClick={showPreviousImage} aria-label="Previous property photo">
              <FaChevronLeft aria-hidden="true" />
            </button>
            <button type="button" className="property-slide-btn next" onClick={showNextImage} aria-label="Next property photo">
              <FaChevronRight aria-hidden="true" />
            </button>
            <div className="property-slide-dots" aria-label="Property photo position">
              {galleryImages.map((imageUrl, index) => (
                <button
                  type="button"
                  key={`${imageUrl}-${index}`}
                  className={index === activeImageIndex ? 'active' : ''}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveImageIndex(index);
                  }}
                  aria-label={`Show photo ${index + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="property-info">
        <h3>{property.title}</h3>
        <p>{property.location}{property.exactLocationLocked ? ' (approx.)' : ''}</p>
        <span className={`availability-pill ${availabilityClass}`}>{availabilityStatus}</span>
        {displayType && <p>{displayType}</p>}
        <p>Rs. {property.price}/month</p>
        <div className="property-amenities">
          <span>{parkingLabel(property.parkingType, property.parkingAvailable)}</span>
          <span>{property.petFriendly ? 'Pet friendly' : 'No pets'}</span>
          <span>{property.kitchenAvailable ? 'Kitchen' : 'No kitchen'}</span>
        </div>

        {property.ownerId?.kycStatus === 'verified' && (
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
            <button
              onClick={() => onApplyBooking(property)}
              disabled={isOccupied}
              title={isOccupied ? 'This property is currently occupied' : 'Book a visit'}
            >
              {isOccupied ? 'Occupied' : 'Book Visit'}
            </button>
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
