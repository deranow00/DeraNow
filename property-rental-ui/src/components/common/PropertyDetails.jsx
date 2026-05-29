import React, { useContext, useEffect, useState } from 'react';
import { FaStar } from 'react-icons/fa';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './PropertyDetails.css';

const BOOKING_CHARGE_BY_TYPE = {
  Condo: 2000,
  Apartment: 2500,
  House: 4000,
};

const displayPropertyType = (type) => (type === 'Condo' ? 'Room' : type === 'Apartment' ? 'Flat' : type || 'Property');

export default function PropertyDetails({ id }) {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const propertyId = id || routeId;
  const { token } = useContext(AuthContext);
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(null);
  const [rated, setRated] = useState(false);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!propertyId) return;

    const fetchProperty = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/properties/${propertyId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch property');

        setProperty(data);

        if (data.userRating) {
          setRating(data.userRating);
          setRated(true);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProperty();
  }, [propertyId, token]);

  const submitReview = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/properties/${propertyId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to submit review');

      setRated(true);
      setProperty((prev) => ({
        ...prev,
        rating: data.rating,
        numRatings: (prev.numRatings || 0) + 1,
        reviews: [
          {
            user: { name: 'You' },
            rating,
            comment,
            createdAt: new Date().toISOString(),
          },
          ...(prev.reviews || []),
        ],
      }));
      setComment('');
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="property-details-popup property-details-state">
        <strong>Loading property details...</strong>
        <p>We are preparing photos, rent details, and verification information.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="property-details-popup property-details-state error">
        <strong>Could not load this property</strong>
        <p>{error}</p>
      </div>
    );
  }
  if (!property) {
    return (
      <div className="property-details-popup property-details-state">
        <strong>No property found</strong>
        <p>This listing may have been removed or is no longer available.</p>
      </div>
    );
  }

  const galleryImages = Array.isArray(property.images) && property.images.length
    ? property.images
    : [property.image || '/default-property.jpg'];
  const ownerVerified = property.ownerId?.ownerVerificationStatus === 'verified';
  const bookingCharge = BOOKING_CHARGE_BY_TYPE[property.type] || BOOKING_CHARGE_BY_TYPE.Condo;
  const availabilityStatus = property.availabilityStatus || 'Available';
  const availabilityClass = availabilityStatus.toLowerCase().replace(/\s+/g, '-');
  const nearbyHints = [
    'Check walking distance to bus stops, markets, pharmacies, and your daily route before final booking.',
    'During your visit, verify water access, noise level, sunlight, and mobile network quality.',
  ];

  return (
    <div className="property-details-popup">
      {routeId && (
        <button className="details-close-btn" onClick={() => navigate(-1)}>
          Close
        </button>
      )}
      <div className="property-details-titlebar">
        <div>
          <span className="property-type-pill">{displayPropertyType(property.type)}</span>
          <h2>{property.title}</h2>
          <p>
            {property.location}
            {property.exactLocationLocked ? ' (approximate area)' : ''}
          </p>
        </div>
        <div className="property-trust-stack">
          <span className={`availability-badge ${availabilityClass}`}>{availabilityStatus}</span>
          {ownerVerified && <span className="verified-badge">Verified Owner</span>}
          {property.status === 'Approved' && <span className="checked-badge">DeraNow checked</span>}
        </div>
      </div>
      <div className="property-details-gallery">
        <img src={galleryImages[0]} alt={property.title} />
        <div className="property-details-thumbs">
          {galleryImages.slice(0, 5).map((imageUrl, index) => (
            <img key={`${imageUrl}-${index}`} src={imageUrl} alt={`${property.title} ${index + 1}`} />
          ))}
        </div>
      </div>

      <section className="property-quick-grid">
        <article><span>Monthly Rent</span><strong>Rs. {Number(property.price || 0).toLocaleString()}</strong></article>
        <article><span>Visit Pass</span><strong>Rs. 500</strong></article>
        <article><span>Booking Charge</span><strong>Rs. {bookingCharge.toLocaleString()}</strong></article>
        <article><span>Availability</span><strong>{availabilityStatus}</strong></article>
        <article><span>Rooms</span><strong>{property.bedrooms || 0} bed / {property.bathrooms || 0} bath</strong></article>
      </section>

      <section className="property-badge-row">
        <span>{property.parkingAvailable ? 'Parking available' : 'No parking listed'}</span>
        <span>{property.petFriendly ? 'Pet friendly' : 'Pets not listed'}</span>
        <span>{ownerVerified ? 'Verified owner' : 'Owner verification pending'}</span>
        <span>{availabilityStatus}</span>
        <span>{property.status === 'Approved' ? 'Approved listing' : property.status}</span>
      </section>

      <section className="property-detail-section">
        <h3>About this {displayPropertyType(property.type).toLowerCase()}</h3>
        <p>{property.description || 'No detailed description has been added yet. Visit the property and confirm room condition, access, and rules before payment.'}</p>
      </section>

      <section className="property-detail-split">
        <article>
          <h3>Owner & trust</h3>
          <dl>
            <dt>Owner</dt><dd>{property.ownerId?.name || 'Not provided'}</dd>
            <dt>Email</dt><dd>{property.ownerId?.email || 'Not provided'}</dd>
            <dt>Verification</dt><dd>{ownerVerified ? 'Verified by DeraNow' : 'Not verified yet'}</dd>
          </dl>
        </article>
        <article>
          <h3>Required charges</h3>
          <dl>
            <dt>Visit pass</dt><dd>Rs. 500 before scheduling visits</dd>
            <dt>Booking charge</dt><dd>Rs. {bookingCharge.toLocaleString()} after visit completion</dd>
            <dt>Monthly rent</dt><dd>Rs. {Number(property.price || 0).toLocaleString()} per month</dd>
            <dt>Location access</dt><dd>{property.exactLocationLocked ? 'Exact address unlocks after visit payment approval or visit booking.' : 'Exact address available'}</dd>
          </dl>
        </article>
      </section>

      <section className="property-detail-section">
        <h3>Nearby and map preview</h3>
        <div className="property-map-preview">
          <iframe
            title={`Map preview for ${property.location}`}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(property.location || 'Nepal')}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
            loading="lazy"
          />
        </div>
        <ul className="property-nearby-list">
          {nearbyHints.map((hint) => <li key={hint}>{hint}</li>)}
        </ul>
      </section>

      <section className="property-detail-section">
        <h3>House rules to confirm</h3>
        <div className="property-rule-grid">
          <span>Confirm monthly rent and due date with owner.</span>
          <span>Check parking, pet, guest, and noise rules before booking.</span>
          <span>Use DeraNow visit and booking flow for payment tracking.</span>
        </div>
      </section>

      <div className="property-rating">
        <strong>Average Rating:</strong>
        {[...Array(5)].map((_, i) => (
          <FaStar
            key={i}
            color={i < Math.round(property.rating) ? '#FFD700' : '#ccc'}
          />
        ))}
        <span> ({property.numRatings || 0})</span>
      </div>

      {rated && <p>✅ You rated this property {rating} stars.</p>}

      {!rated && (
        <div className="rating-form">
          <h4>Leave a review</h4>
          {!token && <p>Please log in to leave a review.</p>}

          {[...Array(5)].map((_, i) => {
            const value = i + 1;
            return (
              <FaStar
                key={i}
                size={25}
                color={value <= (hover || rating) ? '#FFD700' : '#ccc'}
                onMouseEnter={() => setHover(value)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setRating(value)}
                style={{ cursor: 'pointer', marginRight: '5px' }}
              />
            );
          })}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share what you liked..."
          />
          <button onClick={submitReview} disabled={!rating || !token}>
            Submit Review
          </button>
        </div>
      )}

      {property.reviews?.length > 0 && (
        <div className="reviews">
          <h4>Recent Reviews</h4>
          {property.reviews.map((review, idx) => (
            <div className="review-card" key={idx}>
              <div className="review-header">
                <strong>{review.user?.name || 'User'}</strong>
                <span>{new Date(review.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="review-stars">
                {[...Array(5)].map((_, i) => (
                  <FaStar key={i} color={i < review.rating ? '#FFD700' : '#ccc'} />
                ))}
              </div>
              <p>{review.comment || 'No comment provided.'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
