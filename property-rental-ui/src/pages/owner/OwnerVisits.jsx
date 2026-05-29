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

  const now = new Date();
  const upcomingVisits = visits.filter((visit) => new Date(visit.visitDate) >= now && visit.status === 'scheduled');
  const completedVisits = visits.filter((visit) => visit.renterMarkedDoneAt && visit.ownerMarkedDoneAt);
  const pendingOwnerAction = visits.filter((visit) => !visit.ownerMarkedDoneAt && visit.status !== 'cancelled');
  const bookingConversions = visits.filter((visit) => visit.booking || visit.bookingConfirmationStatus === 'paid');

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

  if (loading) {
    return (
      <div className="owner-visits-page">
        <div className="owner-visits-state">
          <strong>Loading property visits...</strong>
          <p>Preparing visit schedule, renter contact details, and booking conversion status.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="owner-visits-page">
      <section className="owner-visits-header">
        <h1>Property Visits</h1>
        <p>Mark visits as done after meeting the renter. Booking confirmation unlocks only after both sides mark done.</p>
      </section>

      {error && <p className="owner-visits-alert error">{error}</p>}
      {success && <p className="owner-visits-alert success">{success}</p>}

      <section className="owner-visits-summary">
        <article><span>Upcoming</span><strong>{upcomingVisits.length}</strong></article>
        <article><span>Needs Your Mark</span><strong>{pendingOwnerAction.length}</strong></article>
        <article><span>Completed</span><strong>{completedVisits.length}</strong></article>
        <article><span>Booking Conversions</span><strong>{bookingConversions.length}</strong></article>
      </section>

      <section className="owner-visits-list">
        {visits.length === 0 ? (
          <div className="owner-visits-state">
            <strong>No property visits scheduled yet.</strong>
            <p>When renters book visits for your properties, they will appear here with contact details and completion controls.</p>
          </div>
        ) : (
          visits.map((visit) => {
            const bothMarkedDone = Boolean(visit.renterMarkedDoneAt && visit.ownerMarkedDoneAt);
            const conversionLabel = visit.booking
              ? `Booking ${visit.booking.paymentStatus || visit.booking.status || 'submitted'}`
              : visit.bookingConfirmationStatus === 'pending_verification'
                ? 'Booking fee under admin review'
                : bothMarkedDone
                  ? 'Waiting renter confirmation'
                  : 'Visit in progress';
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
                    <span>Email</span><strong>{visit.renter?.email || 'N/A'}</strong>
                    <span>Date</span><strong>{new Date(visit.visitDate).toLocaleDateString()}</strong>
                    <span>Promo</span><strong>{visit.promoCode}</strong>
                    <span>Renter Done</span><strong>{visit.renterMarkedDoneAt ? 'Yes' : 'No'}</strong>
                    <span>Owner Done</span><strong>{visit.ownerMarkedDoneAt ? 'Yes' : 'No'}</strong>
                    <span>Conversion</span><strong>{conversionLabel}</strong>
                  </div>
                  <div className="owner-visit-progress">
                    <span className={visit.renterMarkedDoneAt ? 'done' : ''}>Renter marked done</span>
                    <span className={visit.ownerMarkedDoneAt ? 'done' : ''}>Owner marked done</span>
                    <span className={visit.booking ? 'done' : ''}>Booking created</span>
                    <span className={visit.bookingConfirmationStatus === 'paid' ? 'done' : ''}>Fee verified</span>
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
