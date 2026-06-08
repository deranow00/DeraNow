import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './Visits.css';

const QR_IMAGE_URL =
  import.meta.env.VITE_BOOKING_CONFIRMATION_QR_URL ||
  import.meta.env.VITE_MANUAL_PAYMENT_QR_URL ||
  'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';

export default function Visits() {
  const { token } = useContext(AuthContext);
  const [passInfo, setPassInfo] = useState(null);
  const [visits, setVisits] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [confirmVisit, setConfirmVisit] = useState(null);
  const [confirmForm, setConfirmForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    moveInDate: '',
    occupants: '1',
    employmentStatus: '',
    monthlyIncome: '',
    moveInReason: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    transactionRef: '',
    noteToOwner: '',
    leaseDurationMonths: '12',
  });

  const emptyConfirmForm = {
    fullName: '',
    phone: '',
    email: '',
    moveInDate: '',
    occupants: '1',
    employmentStatus: '',
    monthlyIncome: '',
    moveInReason: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    transactionRef: '',
    noteToOwner: '',
    leaseDurationMonths: '12',
  };

  const loadVisits = async () => {
    if (!token) {
      setPassInfo(null);
      setVisits([]);
      setLoading(false);
      setError('Please log in to manage property visits.');
      return;
    }
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
  const isVisitCompleted = (visit) =>
    Boolean(visit?.renterMarkedDoneAt && visit?.ownerMarkedDoneAt) ||
    visit?.status === 'completed' ||
    visit?.status === 'booking_pending';
  const isVisitPast = (visit) => isVisitCompleted(visit) || visit?.status === 'cancelled';
  const pendingVisits = visits.filter((visit) => !isVisitPast(visit));
  const pastVisits = visits.filter((visit) => isVisitPast(visit));
  const visibleVisits = activeTab === 'past' ? pastVisits : pendingVisits;

  const bookingChargeAmounts = passInfo?.bookingConfirmationAmounts || {};
  const getConfirmationAmount = (visit) =>
    Number(bookingChargeAmounts[visit?.property?.type] || bookingChargeAmounts.Condo || 2000);

  const getVisitStatusLabel = (visit) => {
    if (!visit) return 'Visit';
    if (visit.status === 'cancelled') return 'Cancelled';
    if (visit.status === 'booking_pending') return 'Booking submitted';
    if (isVisitCompleted(visit) && visit.booking) return 'Booking submitted';
    if (isVisitCompleted(visit)) return 'Visit completed';
    if (visit.renterMarkedDoneAt && !visit.ownerMarkedDoneAt) return 'Waiting for owner';
    if (visit.ownerMarkedDoneAt && !visit.renterMarkedDoneAt) return 'Waiting for you';
    return 'Upcoming visit';
  };

  const getVisitInsight = (visit) => {
    if (!visit) {
      return {
        title: 'Visit',
        actor: 'DeraNow',
        next: 'No visit details available.',
      };
    }

    if (visit.status === 'cancelled') {
      return {
        title: 'Cancelled visit',
        actor: visit.cancelledByRole || 'User/admin',
        next: visit.cancellationReason || 'This visit is no longer active.',
      };
    }

    if (visit.status === 'booking_pending') {
      return {
        title: 'Booking submitted',
        actor: 'DeraNow admin',
        next: 'Waiting for admin to verify your booking payment.',
      };
    }

    if (isVisitCompleted(visit) && !visit.booking) {
      return {
        title: 'Visit completed',
        actor: 'You and the owner',
        next: 'Confirm booking once you are ready to move forward.',
      };
    }

    if (visit.renterMarkedDoneAt && !visit.ownerMarkedDoneAt) {
      return {
        title: 'Waiting for owner',
        actor: 'Property owner',
        next: 'The owner needs to mark the visit as done before booking can be confirmed.',
      };
    }

    if (visit.ownerMarkedDoneAt && !visit.renterMarkedDoneAt) {
      return {
        title: 'Waiting for you',
        actor: 'You',
        next: 'Mark the visit as done after the visit ends.',
      };
    }

    return {
      title: 'Upcoming visit',
      actor: 'You',
      next: 'Use the visit card actions when you arrive.',
    };
  };

  const renderVisitCard = (visit) => {
    const bothMarkedDone = Boolean(visit.renterMarkedDoneAt && visit.ownerMarkedDoneAt);
    const canConfirm = bothMarkedDone && visit.bookingConfirmationStatus === 'none' && !visit.booking;
    const statusLabel = getVisitStatusLabel(visit);
    const insight = getVisitInsight(visit);
    const isPastVisit = isVisitPast(visit);

    return (
      <article className={`visit-card ${isPastVisit ? 'past' : ''}`} key={visit._id}>
        <img src={visit.property?.image || '/default-property.jpg'} alt={visit.property?.title || 'Property'} />
        <div>
          <div className="visit-card-topline">
            <span className={`visit-state-pill ${String(visit.status || '').toLowerCase()}`}>{statusLabel}</span>
            {visit.bookingConfirmationStatus !== 'none' && (
              <span className="visit-state-pill muted">
                Booking fee {visit.bookingConfirmationStatus.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <h3>{visit.property?.title || 'Property'}</h3>
          <p>{visit.property?.location || 'Location not provided'}</p>
          <div className="visit-card-meta">
            <span>{new Date(visit.visitDate).toLocaleDateString()}</span>
            <span>Promo: {visit.promoCode}</span>
            <span>Renter: {visit.renterMarkedDoneAt ? 'Done' : 'Pending'}</span>
            <span>Owner: {visit.ownerMarkedDoneAt ? 'Done' : 'Pending'}</span>
          </div>
          <div className="visit-card-note">
            <strong>{insight.title}</strong>
            <span>{insight.next}</span>
          </div>
          <div className="visit-card-actions">
            {!visit.renterMarkedDoneAt && !isPastVisit && (
              <button disabled={updatingId === visit._id} onClick={() => markDone(visit._id)}>
                {updatingId === visit._id ? 'Updating...' : 'Mark Visit Done'}
              </button>
            )}
            {canConfirm && (
              <button
                onClick={() => {
                  setConfirmVisit(visit);
                  setConfirmForm(emptyConfirmForm);
                }}
              >
                Confirm Booking
              </button>
            )}
            {visit.booking && <span className="visit-booking-link">Booking submitted</span>}
            {isPastVisit && !canConfirm && !visit.booking && (
              <span className="visit-booking-link muted">No further action required</span>
            )}
          </div>
        </div>
      </article>
    );
  };

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
      setConfirmForm(emptyConfirmForm);
      await loadVisits();
    } catch (err) {
      setError(err.message || 'Failed to confirm booking');
    } finally {
      setUpdatingId('');
    }
  };

  if (loading) {
    return (
      <div className="renter-visits-page">
        <div className="visits-state-card">
          <strong>Loading visits...</strong>
          <p>Checking your visit pass, scheduled visits, and booking confirmation status.</p>
        </div>
      </div>
    );
  }

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
                  ? `Your previous promo was used for a booking. Pay Rs. ${Number(passInfo?.amount || 500).toLocaleString()} again to book more visits.`
                : 'Open any property and book a visit to submit your first pass payment.'}
          </p>
        </div>
        <strong>{activePass?.promoCode || latestPass?.status || `Rs. ${passInfo?.amount || 500}`}</strong>
      </section>

      <section className="visits-list">
        <div className="visits-list-head">
          <div>
            <h2>{activeTab === 'past' ? 'Past visits' : 'Pending visits'}</h2>
            <p>{activeTab === 'past' ? 'Visits that are done, booking submitted, or cancelled.' : 'Visits that still need attention.'}</p>
          </div>
          <span>{visibleVisits.length}</span>
        </div>

        <div className="visit-tab-bar">
          <button
            type="button"
            className={activeTab === 'pending' ? 'active' : ''}
            onClick={() => setActiveTab('pending')}
          >
            Pending visits ({pendingVisits.length})
          </button>
          <button
            type="button"
            className={activeTab === 'past' ? 'active' : ''}
            onClick={() => setActiveTab('past')}
          >
            Past visits ({pastVisits.length})
          </button>
        </div>

        {visibleVisits.length === 0 ? (
          <div className="visits-state-card">
            <strong>
              {activeTab === 'past' ? 'No past visits yet.' : 'No pending visits right now.'}
            </strong>
            <p>
              {activeTab === 'past'
                ? 'Completed visits, booking submissions, and cancellations will appear here.'
                : 'Open a property, pay the visit pass, and schedule a visit to get started.'}
            </p>
          </div>
        ) : (
          visibleVisits.map(renderVisitCard)
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
            <div className="visit-confirm-payment">
              <div>
                <span>Booking charge</span>
                <strong>Rs. {getConfirmationAmount(confirmVisit).toLocaleString()}</strong>
                <ol>
                  <li>Scan the QR and pay the exact amount shown.</li>
                  <li>Enter transaction reference and renter details below.</li>
                  <li>Admin verifies payment, then your confirmed booking appears in Bookings.</li>
                </ol>
              </div>
              <img src={QR_IMAGE_URL} alt="Booking confirmation payment QR" />
            </div>
            <div className="visit-confirm-form-grid">
              <label>
                Full Name *
                <input
                  value={confirmForm.fullName}
                  onChange={(e) => setConfirmForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  placeholder="Your legal name"
                />
              </label>
              <label>
                Phone Number *
                <input
                  value={confirmForm.phone}
                  onChange={(e) => setConfirmForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="Mobile number"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={confirmForm.email}
                  onChange={(e) => setConfirmForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="Email for booking updates"
                />
              </label>
              <label>
                Move-in Date *
                <input
                  type="date"
                  min={today}
                  value={confirmForm.moveInDate}
                  onChange={(e) => setConfirmForm((prev) => ({ ...prev, moveInDate: e.target.value }))}
                />
              </label>
              <label>
                Lease Duration (months) *
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={confirmForm.leaseDurationMonths}
                  onChange={(e) => setConfirmForm((prev) => ({ ...prev, leaseDurationMonths: e.target.value }))}
                />
              </label>
              <label>
                Occupants *
                <input
                  type="number"
                  min="1"
                  value={confirmForm.occupants}
                  onChange={(e) => setConfirmForm((prev) => ({ ...prev, occupants: e.target.value }))}
                />
              </label>
              <label>
                Employment Status
                <input
                  value={confirmForm.employmentStatus}
                  onChange={(e) => setConfirmForm((prev) => ({ ...prev, employmentStatus: e.target.value }))}
                  placeholder="Student, employed, business..."
                />
              </label>
              <label>
                Monthly Income
                <input
                  type="number"
                  min="0"
                  value={confirmForm.monthlyIncome}
                  onChange={(e) => setConfirmForm((prev) => ({ ...prev, monthlyIncome: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label>
                Emergency Contact Name
                <input
                  value={confirmForm.emergencyContactName}
                  onChange={(e) => setConfirmForm((prev) => ({ ...prev, emergencyContactName: e.target.value }))}
                  placeholder="Contact person"
                />
              </label>
              <label>
                Emergency Contact Phone
                <input
                  value={confirmForm.emergencyContactPhone}
                  onChange={(e) => setConfirmForm((prev) => ({ ...prev, emergencyContactPhone: e.target.value }))}
                  placeholder="Contact number"
                />
              </label>
              <label>
                Transaction Reference *
                <input
                  placeholder="QR transaction id"
                  value={confirmForm.transactionRef}
                  onChange={(e) => setConfirmForm((prev) => ({ ...prev, transactionRef: e.target.value }))}
                />
              </label>
            </div>
            <label>Reason for Moving</label>
            <textarea
              rows="2"
              value={confirmForm.moveInReason}
              onChange={(e) => setConfirmForm((prev) => ({ ...prev, moveInReason: e.target.value }))}
              placeholder="Short reason"
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
