import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './OwnerVisits.css';

export default function OwnerVisits() {
  const { token } = useContext(AuthContext);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatingId, setUpdatingId] = useState('');

  const loadVisits = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/visits/owner`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to load visits');
      setVisits(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err.message || 'Failed to load visits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVisits();
  }, [token]);

  const markDone = async (visitId) => {
    setUpdatingId(visitId);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/visits/${visitId}/mark-done`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to mark visit done');
      setSuccess('Visit marked as done.');
      await loadVisits();
    } catch (err) {
      setError(err.message || 'Failed to mark visit done');
    } finally {
      setUpdatingId('');
    }
  };

  if (loading) return <p>Loading property visits...</p>;

  return (
    <div className="owner-visits-page">
      <section className="owner-visits-header">
        <h1>Property Visits</h1>
        <p>Mark visits as done after meeting the renter. Booking confirmation unlocks only after both sides mark done.</p>
      </section>

      {error && <p className="owner-visits-alert error">{error}</p>}
      {success && <p className="owner-visits-alert success">{success}</p>}

      <section className="owner-visits-list">
        {visits.length === 0 ? (
          <p className="owner-visits-empty">No property visits scheduled yet.</p>
        ) : (
          visits.map((visit) => {
            const bothMarkedDone = Boolean(visit.renterMarkedDoneAt && visit.ownerMarkedDoneAt);
            return (
              <article className="owner-visit-card" key={visit._id}>
                <img src={visit.property?.image || '/default-property.jpg'} alt={visit.property?.title || 'Property'} />
                <div className="owner-visit-body">
                  <div>
                    <h2>{visit.property?.title || 'Property'}</h2>
                    <p>{visit.property?.location || 'Location not provided'}</p>
                  </div>
                  <div className="owner-visit-grid">
                    <span>Renter</span><strong>{visit.renter?.name || visit.renter?.email || 'N/A'}</strong>
                    <span>Phone</span><strong>{visit.visitPass?.contactPhone || 'N/A'}</strong>
                    <span>Date</span><strong>{new Date(visit.visitDate).toLocaleDateString()}</strong>
                    <span>Promo</span><strong>{visit.promoCode}</strong>
                    <span>Renter Done</span><strong>{visit.renterMarkedDoneAt ? 'Yes' : 'No'}</strong>
                    <span>Owner Done</span><strong>{visit.ownerMarkedDoneAt ? 'Yes' : 'No'}</strong>
                    <span>Booking</span><strong>{visit.booking ? 'Submitted' : visit.bookingConfirmationStatus || 'None'}</strong>
                  </div>
                  <div className="owner-visit-actions">
                    {!visit.ownerMarkedDoneAt && (
                      <button disabled={updatingId === visit._id} onClick={() => markDone(visit._id)}>
                        {updatingId === visit._id ? 'Updating...' : 'Mark Visit Done'}
                      </button>
                    )}
                    {bothMarkedDone && !visit.booking && (
                      <span>Waiting for renter to confirm booking</span>
                    )}
                    {visit.booking && <span>Booking request created</span>}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
