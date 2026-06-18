import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config/api';
import './BookingPopup.css';

const QR_IMAGE_URL =
  import.meta.env.VITE_VISIT_PASS_QR_URL ||
  import.meta.env.VITE_MANUAL_PAYMENT_QR_URL ||
  'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';

export default function BookingPopup({ property, onClose }) {
  const { token } = useContext(AuthContext);
  const { showToast } = useToast();
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [visitDate, setVisitDate] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [note, setNote] = useState('');
  const [passState, setPassState] = useState(null);
  const [visits, setVisits] = useState([]);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPass, setLoadingPass] = useState(false);

  const activePass = passState?.activePass;
  const latestPass = passState?.latestPass;
  const hasActivePass = Boolean(passState?.hasActivePass);
  const hasPendingPass = latestPass?.status === 'pending_payment';

  const loadVisitState = async () => {
    if (!token) {
      setPassState(null);
      setVisits([]);
      setLoadingPass(false);
      return;
    }
    setLoadingPass(true);
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
      setPassState(passPayload);
      setVisits(Array.isArray(visitsPayload) ? visitsPayload : []);
      if (passPayload?.activePass?.promoCode) {
        setPromoCode(passPayload.activePass.promoCode);
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoadingPass(false);
    }
  };

  useEffect(() => {
    loadVisitState();
  }, [token]);

  const submitVisitPassPayment = async () => {
    setMessage('');
    setSuccess('');

    if (!token) {
      setMessage('Please log in to book a property visit.');
      return;
    }
    if (!visitDate) {
      setMessage('Please select the date you want to visit.');
      return;
    }
    if (!contactPhone.trim()) {
      setMessage('Please enter your phone number for admin verification.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/visits/pass/payment-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: property._id,
          visitDate,
          transactionRef,
          contactPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit visit pass payment');
      setSuccess('Payment notification sent. Admin will verify and send your promo code.');
      showToast('The form submitted successfully.');
      await loadVisitState();
    } catch (err) {
      setMessage(err.message);
      showToast(err.message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const bookVisit = async () => {
    setMessage('');
    setSuccess('');

    if (!visitDate) {
      setMessage('Please select a visit date.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/visits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: property._id,
          visitDate,
          promoCode,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to book visit');
      setSuccess('Visit booked successfully.');
      showToast('Visit booked successfully.');
      await loadVisitState();
      setTimeout(onClose, 1200);
    } catch (err) {
      setMessage(err.message);
      showToast(err.message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMessage('');
    setSuccess('');
    setVisitDate('');
    setLoading(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content booking-modal visit-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} aria-label="Close popup" title="Close">
          x
        </button>

        <h2>Book a Visit</h2>
        <p className="booking-subtitle">
          Visit <strong>{property.title}</strong> before sending a rent booking request.
        </p>

        {loadingPass ? (
          <p className="visit-muted">Checking your visit pass...</p>
        ) : hasActivePass ? (
          <div className="visit-pass-card active">
            <span>Active visit promo</span>
            <strong>{activePass?.promoCode}</strong>
            <p>Use this code to book unlimited DeraNow property visits.</p>
          </div>
        ) : hasPendingPass ? (
          <div className="visit-pass-card pending">
            <span>Payment waiting for admin approval</span>
            <strong>Submitted</strong>
            <p>Your promo code will arrive in notifications after admin verifies the QR payment.</p>
          </div>
        ) : (
          <div className="visit-payment-panel">
            <div>
              <h3>One-time visit pass</h3>
              <p>Pay once, get a promo code, then book visits for unlimited properties.</p>
              <strong>Rs. {passState?.amount || 500}</strong>
              <ol className="payment-steps">
                <li>Scan the QR and pay exactly Rs. {passState?.amount || 500}.</li>
                <li>Enter your phone number and transaction reference.</li>
                <li>Tap notify admin. Your promo code arrives after verification.</li>
              </ol>
            </div>
            <div className="payment-qr-card">
              <img src={QR_IMAGE_URL} alt="DeraNow visit pass payment QR" />
              <span>DeraNow visit pass QR</span>
            </div>
          </div>
        )}

        <div className="booking-grid">
          <div>
            <label>Visit Date *</label>
            <input type="date" min={today} value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
          </div>

          {hasActivePass ? (
            <div>
              <label>Promo Code *</label>
              <input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} />
            </div>
          ) : (
            <div>
              <label>Phone *</label>
              <input
                placeholder="Your phone number"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                disabled={hasPendingPass}
              />
            </div>
          )}

          {!hasActivePass && (
            <div className="span-2">
              <label>Transaction Reference</label>
              <input
                placeholder="QR transaction id or note"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                disabled={hasPendingPass}
              />
            </div>
          )}

          {hasActivePass && (
            <div className="span-2">
              <label>Visit Note</label>
              <textarea
                rows="3"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Preferred time or anything admin should know"
              />
            </div>
          )}
        </div>

        {hasActivePass ? (
          <button className="booking-submit-btn" onClick={bookVisit} disabled={loading}>
            {loading ? 'Booking Visit...' : 'Book Visit'}
          </button>
        ) : (
          <button className="booking-submit-btn" onClick={submitVisitPassPayment} disabled={loading || hasPendingPass}>
            {hasPendingPass ? 'Waiting for Admin Approval' : loading ? 'Submitting...' : 'I Have Paid - Notify Admin'}
          </button>
        )}

        {visits.length > 0 && (
          <div className="visit-history">
            <h3>Your recent visits</h3>
            {visits.slice(0, 3).map((visit) => (
              <div key={visit._id} className="visit-history-row">
                <span>{visit.property?.title || 'Property'}</span>
                <strong>{new Date(visit.visitDate).toLocaleDateString()}</strong>
              </div>
            ))}
          </div>
        )}

        {message && <p className="error">{message}</p>}
        {success && <p className="success">{success}</p>}
      </div>
    </div>
  );
}
