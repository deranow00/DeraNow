import React, { useContext, useEffect, useState } from 'react';
import { FaStar } from 'react-icons/fa';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './PropertyDetails.css';

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

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error">{error}</p>;
  if (!property) return <p>No property found</p>;

  return (
    <div className="property-details-popup">
      {routeId && (
        <button className="details-close-btn" onClick={() => navigate(-1)}>
          Close
        </button>
      )}
      <h2>{property.title}</h2>
      <img src={property.image || '/default-property.jpg'} alt={property.title} />
      <p>
        <strong>Location:</strong> {property.location}
      </p>
      <p>
        <strong>Rent:</strong> Rs. {property.price}/month
      </p>
      <p>
        <strong>Description:</strong> {property.description}
      </p>
      <p>
        <strong>Status:</strong> {property.status}
      </p>
      {property.ownerId && (
        <p>
          <strong>Owner:</strong> {property.ownerId.name} ({property.ownerId.email}){' '}
          {property.ownerId.ownerVerificationStatus === 'verified' && (
            <span className="verified-badge">Verified Owner</span>
          )}
        </p>
      )}

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
