import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './Visits.css';

const BOOKING_CONFIRMATION_AMOUNTS = {
  Condo: 2000,
  Apartment: 2500,
  House: 4000,
};

const QR_IMAGE_URL =
  import.meta.env.VITE_BOOKING_CONFIRMATION_QR_URL ||
  import.meta.env.VITE_MANUAL_PAYMENT_QR_URL ||
  'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';

export default function Visits() {
  const { token } = useContext(AuthContext);
  const [passInfo, setPassInfo] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [confirmVisit, setConfirmVisit] = useState(null);
  const [confirmForm, setConfirmForm] = useState({
    moveInDate: '',
    transactionRef: '',
    noteToOwner: '',
  });

  const loadVisits = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [passRes, visitsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/visits/pass/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/api/visits/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const passPayload = await passRes.json();
      const visitsPayload = await visitsRes.json();
      if (!passRes.ok) throw new Error(passPayload.error || 'Failed to load visit pass');
      if (!visitsRes.ok) throw new Error(visitsPayload.error || 'Failed to load visits');
      setPassInfo(passPayload);
      setVisits(Array.isArray(visitsPayload) ? visitsPayload : []);
    } catch (err) {
      setError(err.message || 'Failed to load visits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVisits();
  }, [token]);

  const latestPass = passInfo?.latestPass;
  const activePass = passInfo?.activePass;
  const today = new Date().toISOString().split('T')[0];

  const getConfirmationAmount = (visit) =>
    BOOKING_CONFIRMATION_AMOUNTS[visit?.property?.type] || BOOKING_CONFIRMATION_AMOUNTS.Condo;

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

  const submitConfirmation = async () => {
    if (!confirmVisit) return;
    setUpdatingId(confirmVisit._id);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/visits/${confirmVisit._id}/confirm-booking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(confirmForm),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to confirm booking');
      setSuccess('Booking confirmation submitted. Your visit promo code has ended.');
      setConfirmVisit(null);
      setConfirmForm({ moveInDate: '', transactionRef: '', noteToOwner: '' });
      await loadVisits();
    } catch (err) {
      setError(err.message || 'Failed to confirm booking');
    } finally {
      setUpdatingId('');
    }
  };

  if (loading) return <p>Loading visits...</p>;

  return (
    <div className="renter-visits-page">
      <section className="visits-hero">
        <h1>Property Visits</h1>
        <p>Use your DeraNow visit promo to schedule property visits before applying for rent.</p>
      </section>

      {error && <p className="visits-alert error">{error}</p>}
      {success && <p className="visits-alert success">{success}</p>}

      <section className="visit-pass-summary">
        <div>
          <span>Visit pass</span>
          <h2>{activePass ? 'Active' : latestPass?.status === 'pending_payment' ? 'Pending approval' : 'Not active'}</h2>
          <p>
            {activePass
              ? 'You can book unlimited property visits.'
              : latestPass?.status === 'pending_payment'
                ? 'Admin is verifying your QR payment.'
                : latestPass?.status === 'consumed'
                  ? 'Your previous promo was used for a booking. Pay Rs. 500 again to book more visits.'
                : 'Open any property and book a visit to submit your first pass payment.'}
          </p>
        </div>
        <strong>{activePass?.promoCode || latestPass?.status || `Rs. ${passInfo?.amount || 500}`}</strong>
      </section>

      <section className="visits-list">
        <div className="visits-list-head">
          <h2>Scheduled visits</h2>
          <span>{visits.length}</span>
        </div>

        {visits.length === 0 ? (
          <p className="visits-empty">No visits booked yet.</p>
        ) : (
          visits.map((visit) => {
            const bothMarkedDone = Boolean(visit.renterMarkedDoneAt && visit.ownerMarkedDoneAt);
            const canConfirm =
              bothMarkedDone &&
              visit.bookingConfirmationStatus === 'none' &&
              !visit.booking;
            return (
            <article className="visit-card" key={visit._id}>
              <img src={visit.property?.image || '/default-property.jpg'} alt={visit.property?.title || 'Property'} />
              <div>
                <h3>{visit.property?.title || 'Property'}</h3>
                <p>{visit.property?.location || 'Location not provided'}</p>
                <div className="visit-card-meta">
                  <span>{new Date(visit.visitDate).toLocaleDateString()}</span>
                  <span>{visit.status}</span>
                  <span>{visit.promoCode}</span>
                  <span>Renter: {visit.renterMarkedDoneAt ? 'Done' : 'Pending'}</span>
                  <span>Owner: {visit.ownerMarkedDoneAt ? 'Done' : 'Pending'}</span>
                  {visit.bookingConfirmationStatus !== 'none' && (
                    <span>Booking fee: {visit.bookingConfirmationStatus}</span>
                  )}
                </div>
                <div className="visit-card-actions">
                  {!visit.renterMarkedDoneAt && (
                    <button disabled={updatingId === visit._id} onClick={() => markDone(visit._id)}>
                      {updatingId === visit._id ? 'Updating...' : 'Mark Visit Done'}
                    </button>
                  )}
                  {canConfirm && (
                    <button
                      onClick={() => {
                        setConfirmVisit(visit);
                        setConfirmForm({ moveInDate: '', transactionRef: '', noteToOwner: '' });
                      }}
                    >
                      Confirm Booking
                    </button>
                  )}
                  {visit.booking && <span className="visit-booking-link">Booking submitted</span>}
                </div>
              </div>
            </article>
          );
          })
        )}
      </section>

      {confirmVisit && (
        <div className="visit-confirm-overlay" onClick={() => setConfirmVisit(null)}>
          <div className="visit-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <button className="visit-confirm-close" onClick={() => setConfirmVisit(null)}>x</button>
            <h2>Confirm Booking</h2>
            <p>
              Pay Rs. {getConfirmationAmount(confirmVisit)} to confirm booking for{' '}
              <strong>{confirmVisit.property?.title || 'this property'}</strong>.
            </p>
            <img src={QR_IMAGE_URL} alt="Booking confirmation payment QR" />
            <label>Move-in Date *</label>
            <input
              type="date"
              min={today}
              value={confirmForm.moveInDate}
              onChange={(e) => setConfirmForm((prev) => ({ ...prev, moveInDate: e.target.value }))}
            />
            <label>Transaction Reference *</label>
            <input
              placeholder="QR transaction id"
              value={confirmForm.transactionRef}
              onChange={(e) => setConfirmForm((prev) => ({ ...prev, transactionRef: e.target.value }))}
            />
            <label>Note to Owner</label>
            <textarea
              rows="3"
              value={confirmForm.noteToOwner}
              onChange={(e) => setConfirmForm((prev) => ({ ...prev, noteToOwner: e.target.value }))}
            />
            <button disabled={updatingId === confirmVisit._id} onClick={submitConfirmation}>
              {updatingId === confirmVisit._id ? 'Submitting...' : 'I Have Paid - Confirm Booking'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
