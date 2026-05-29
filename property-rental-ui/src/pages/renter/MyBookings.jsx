import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './MyBookings.css';
import PropertyDetails from '../../components/common/PropertyDetails';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { useLanguage } from '../../context/LanguageContext';

const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

const isConfirmedBooking = (booking) => String(booking?.status || '').toLowerCase() === 'approved';

const getRequestInsight = (booking) => {
  const status = String(booking?.status || 'Pending');
  const paymentStatus = String(booking?.paymentStatus || 'pending');
  if (status === 'Pending' && paymentStatus === 'pending_verification') {
    return {
      title: 'Payment under review',
      actor: 'DeraNow admin',
      next: 'Admin verifies your booking charge, then your booking becomes confirmed.',
    };
  }
  if (status === 'Pending') {
    return {
      title: 'Waiting for approval',
      actor: 'Owner or admin',
      next: 'No action needed right now. You will be notified when the request changes.',
    };
  }
  if (status === 'Rejected') {
    return {
      title: 'Request rejected',
      actor: 'Owner or admin',
      next: booking?.bookingDetails?.adminRemark || 'Review the property and book another visit if needed.',
    };
  }
  if (status === 'Cancelled') {
    return {
      title: 'Request cancelled',
      actor: booking?.cancelledByRole || 'User/admin',
      next: booking?.cancellationReason || 'You can explore other properties or submit a new request.',
    };
  }
  return {
    title: 'Request in progress',
    actor: 'DeraNow',
    next: 'Follow the next step shown in the booking timeline.',
  };
};

export default function Bookings({ view = 'confirmed' }) {
  const { token } = useContext(AuthContext);
  const { t } = useLanguage();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [renewingId, setRenewingId] = useState('');
  const [activeBookingId, setActiveBookingId] = useState('');
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [amendments, setAmendments] = useState([]);
  const [ledger, setLedger] = useState({ summary: null, items: [] });
  const [amendmentForm, setAmendmentForm] = useState({
    proposedFromDate: '',
    proposedToDate: '',
    proposedMonthlyRent: '',
    reason: '',
  });
  const [refundForm, setRefundForm] = useState({ amount: '', reason: '' });

  const fetchBookings = async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE_URL}/api/bookings/my`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch bookings');
    setBookings(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    const run = async () => {
      try {
        if (!token) {
          setError('Please log in to view bookings.');
          return;
        }
        await fetchBookings();
      } catch (err) {
        setError(err.message || 'Failed to load bookings');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [token]);

  const loadPanel = async (bookingId) => {
    if (!token) return;
    try {
      setPanelError('');
      setPanelLoading(true);
      const [amendRes, ledgerRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/bookings/${bookingId}/amendments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/api/bookings/${bookingId}/deposit-ledger`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const amendData = await amendRes.json();
      const ledgerData = await ledgerRes.json();
      if (!amendRes.ok) throw new Error(amendData.error || 'Failed to load amendments');
      if (!ledgerRes.ok) throw new Error(ledgerData.error || 'Failed to load deposit ledger');
      setAmendments(amendData.items || []);
      setLedger({
        summary: ledgerData.summary || null,
        items: ledgerData.items || [],
      });
    } catch (err) {
      setPanelError(err.message || 'Failed to load booking controls');
      setAmendments([]);
      setLedger({ summary: null, items: [] });
    } finally {
      setPanelLoading(false);
    }
  };

  const toggleManage = async (bookingId) => {
    if (activeBookingId === bookingId) {
      setActiveBookingId('');
      return;
    }
    setActiveBookingId(bookingId);
    await loadPanel(bookingId);
  };

  const renewBooking = async (bookingId) => {
    if (!token) return;
    setRenewingId(bookingId);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/${bookingId}/renew`, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({ months: 1 }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to renew booking');
      setBookings((prev) =>
        prev.map((booking) => (booking._id === bookingId ? payload.booking : booking))
      );
      if (activeBookingId === bookingId) await loadPanel(bookingId);
    } catch (err) {
      setError(err.message || 'Failed to request renewal');
    } finally {
      setRenewingId('');
    }
  };

  const cancelBooking = async (bookingId) => {
    if (!token) return;
    const reason = window.prompt('Cancellation reason (optional):', '') || '';
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({ reason }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to cancel booking');
      await fetchBookings();
      window.alert(
        `Cancelled. Penalty: Rs ${payload?.cancellation?.penaltyAmount || 0}, Refund: Rs ${payload?.cancellation?.refundAmount || 0}`
      );
    } catch (err) {
      setError(err.message || 'Failed to cancel booking');
    }
  };

  const submitAmendment = async (bookingId) => {
    if (!token) return;
    try {
      const body = {
        reason: amendmentForm.reason,
      };
      if (amendmentForm.proposedFromDate) body.proposedFromDate = amendmentForm.proposedFromDate;
      if (amendmentForm.proposedToDate) body.proposedToDate = amendmentForm.proposedToDate;
      if (amendmentForm.proposedMonthlyRent !== '') body.proposedMonthlyRent = Number(amendmentForm.proposedMonthlyRent);

      const res = await fetch(`${API_BASE_URL}/api/bookings/${bookingId}/amendments`, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to request amendment');
      setAmendmentForm({ proposedFromDate: '', proposedToDate: '', proposedMonthlyRent: '', reason: '' });
      await loadPanel(bookingId);
    } catch (err) {
      setPanelError(err.message || 'Failed to request amendment');
    }
  };

  const decideDeduction = async (bookingId, entryId, status) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/${bookingId}/deposit-ledger/${entryId}/${status === 'approved' ? 'approve' : 'reject'}`, {
        method: 'PATCH',
        headers: jsonHeaders(token),
        body: JSON.stringify({ note: `Renter ${status}` }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to update entry');
      await loadPanel(bookingId);
    } catch (err) {
      setPanelError(err.message || 'Failed to update deduction');
    }
  };

  const requestRefund = async (bookingId) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/${bookingId}/deposit-ledger/refund-request`, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({
          amount: Number(refundForm.amount || 0),
          reason: refundForm.reason,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to request refund');
      setRefundForm({ amount: '', reason: '' });
      await loadPanel(bookingId);
    } catch (err) {
      setPanelError(err.message || 'Failed to request refund');
    }
  };

  const renderTimeline = (workflow) => {
    const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
    if (!steps.length) return <span className="timeline-label">Requested</span>;

    return (
      <div className="booking-timeline-wrap">
        <div className="booking-timeline">
          {steps.map((step) => (
            <span
              key={step.key}
              className={`timeline-node ${step.completed ? 'completed' : ''} ${step.active ? 'active' : ''}`}
              title={step.label}
            />
          ))}
        </div>
        <span className={`timeline-label ${workflow?.stage === 'rejected' ? 'rejected' : ''}`}>
          {workflow?.label || 'Requested'}
        </span>
      </div>
    );
  };

  const getWorkflowHint = (booking) => {
    const workflow = booking?.workflow;
    const stage = workflow?.stage || 'requested';
    const status = booking?.status || 'Pending';
    const paymentStatus = String(booking?.paymentStatus || 'pending').toLowerCase();

    if (stage === 'rejected' || status === 'Rejected') return t('renterBookings.bookingRejected');
    if (status === 'Cancelled') return t('renterBookings.bookingCancelled');
    if (stage === 'requested' || status === 'Pending') return t('renterBookings.waitingOwnerApproval');
    if (stage === 'accepted' && !workflow?.flags?.agreementSigned) return t('renterBookings.signAgreement');
    if (stage === 'agreement_signed' && !workflow?.flags?.paid) {
      if (paymentStatus === 'pending_verification') return t('renterBookings.paymentPendingAdminVerification');
      return t('renterBookings.submitRentPayment');
    }
    if (stage === 'paid' && !workflow?.flags?.movedIn) return t('renterBookings.moveInStarts');
    if (stage === 'moved_in') return t('renterBookings.bookingActive');
    return t('renterBookings.continueFlow');
  };

  const confirmedBookings = bookings.filter(isConfirmedBooking);
  const otherBookings = bookings.filter((booking) => !isConfirmedBooking(booking));
  const displayBookings = view === 'requests' ? otherBookings : confirmedBookings;
  const isRequestsView = view === 'requests';
  const pendingRequests = otherBookings.filter((booking) => booking.status === 'Pending').length;
  const reviewRequests = otherBookings.filter((booking) => booking.paymentStatus === 'pending_verification').length;

  return (
    <div className="bookings-container renter-bookings-container">
      <div className="renter-bookings-header">
        <div>
          <h2>{isRequestsView ? 'Booking Requests' : t('renterBookings.title')}</h2>
          <p>
            {isRequestsView
              ? 'Track pending, rejected, cancelled, and in-review booking requests.'
              : 'Your confirmed DeraNow properties are shown here.'}
          </p>
        </div>
        <div className="renter-bookings-switch">
          <Link className={!isRequestsView ? 'active' : ''} to="/renter/bookings">
            Confirmed ({confirmedBookings.length})
          </Link>
          <Link className={isRequestsView ? 'active' : ''} to="/renter/booking-requests">
            Other Requests ({otherBookings.length})
          </Link>
        </div>
      </div>
      {loading ? (
        <div className="booking-state-card">
          <strong>{t('renterBookings.loading')}</strong>
          <p>Loading your booking timeline, payment status, and next actions.</p>
        </div>
      ) : error ? (
        <div className="booking-state-card error">
          <strong>Could not load bookings</strong>
          <p>{error}</p>
          <button className="btn-renew" onClick={fetchBookings}>Try Again</button>
        </div>
      ) : displayBookings.length === 0 ? (
        <div className="booking-state-card">
          <strong>{isRequestsView ? 'No other booking requests found.' : 'No confirmed bookings yet.'}</strong>
          <p>
            {isRequestsView
              ? 'Pending, rejected, cancelled, and verification requests will appear here.'
              : 'After admin confirms your post-visit booking charge, approved properties appear here.'}
          </p>
        </div>
      ) : (
        <>
          {isRequestsView && (
            <section className="booking-request-summary">
              <article><span>Total Requests</span><strong>{otherBookings.length}</strong></article>
              <article><span>Waiting Approval</span><strong>{pendingRequests}</strong></article>
              <article><span>Payment Review</span><strong>{reviewRequests}</strong></article>
            </section>
          )}
          <table className="bookings-table">
            <thead>
              <tr>
                <th>{t('renterBookings.property')}</th>
                <th>{t('renterBookings.from')}</th>
                <th>{t('renterBookings.to')}</th>
                <th>{t('renterBookings.status')}</th>
                <th>{t('renterBookings.timeline')}</th>
                <th>{t('renterBookings.nextStep')}</th>
                <th>{t('renterBookings.payment')}</th>
                <th>{t('renterBookings.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {displayBookings.map(({ _id, property, fromDate, toDate, status, paymentStatus, workflow, renewalStatus, bookingDetails, cancellationReason, cancelledByRole }) => {
                const requestInsight = getRequestInsight({ status, paymentStatus, bookingDetails, cancellationReason, cancelledByRole });
                return (
                <React.Fragment key={`table-${_id}`}>
                  <tr>
                    <td data-label={t('renterBookings.property')}>{property?.title || 'N/A'}</td>
                    <td data-label={t('renterBookings.from')}>{new Date(fromDate).toLocaleDateString()}</td>
                    <td data-label={t('renterBookings.to')}>{new Date(toDate).toLocaleDateString()}</td>
                    <td data-label={t('renterBookings.status')}>{status || 'N/A'}</td>
                    <td data-label={t('renterBookings.timeline')}>{renderTimeline(workflow)}</td>
                    <td data-label={t('renterBookings.nextStep')}>
                      {isRequestsView ? (
                        <span className="workflow-hint">
                          <strong>{requestInsight.title}</strong><br />
                          {requestInsight.next}
                        </span>
                      ) : (
                        <span className="workflow-hint">{getWorkflowHint({ status, paymentStatus, workflow })}</span>
                      )}
                    </td>
                    <td data-label={t('renterBookings.payment')}>{paymentStatus === 'pending_verification' ? t('renterBookings.pendingVerification') : paymentStatus || 'pending'}</td>
                    <td data-label={t('renterBookings.actions')}>
                      <div className="booking-actions">
                        <button onClick={() => setSelectedProperty(property)}>{t('renterBookings.viewDetails')}</button>
                        <button className="btn-renew" onClick={() => toggleManage(_id)}>
                          {activeBookingId === _id ? t('renterBookings.hideManage') : t('renterBookings.manage')}
                        </button>
                        {status === 'Approved' && (
                          <button
                            className="btn-renew"
                            disabled={renewingId === _id || renewalStatus === 'pending'}
                            onClick={() => renewBooking(_id)}
                          >
                            {renewalStatus === 'pending' ? t('renterBookings.renewPending') : renewingId === _id ? t('renterBookings.requesting') : t('renterBookings.renewOneMonth')}
                          </button>
                        )}
                        {(status === 'Pending' || status === 'Approved') && (
                          <button className="btn-renew" onClick={() => cancelBooking(_id)}>{t('renterBookings.cancel')}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isRequestsView && (
                    <tr>
                      <td className="booking-panel-cell" colSpan="8">
                        <div className="booking-request-panel">
                          <span>Who acts next: <strong>{requestInsight.actor}</strong></span>
                          <span>Payment: <strong>{paymentStatus === 'pending_verification' ? 'Waiting admin verification' : paymentStatus || 'pending'}</strong></span>
                          <span>Reason/status: <strong>{requestInsight.next}</strong></span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {activeBookingId === _id ? (
                    <tr>
                      <td className="booking-panel-cell" colSpan="8">
                        <div className="booking-panel">
                          {panelLoading ? <p>Loading controls...</p> : null}
                          {panelError ? <p className="error">{panelError}</p> : null}
                          {!panelLoading ? (
                            <>
                              <h4>{t('renterBookings.leaseAmendment')}</h4>
                              <div className="booking-panel-grid">
                                <input type="date" value={amendmentForm.proposedFromDate} onChange={(e) => setAmendmentForm((p) => ({ ...p, proposedFromDate: e.target.value }))} />
                                <input type="date" value={amendmentForm.proposedToDate} onChange={(e) => setAmendmentForm((p) => ({ ...p, proposedToDate: e.target.value }))} />
                                <input type="number" placeholder={t('renterBookings.monthlyRentOptional')} value={amendmentForm.proposedMonthlyRent} onChange={(e) => setAmendmentForm((p) => ({ ...p, proposedMonthlyRent: e.target.value }))} />
                                <input type="text" placeholder={t('renterBookings.reason')} value={amendmentForm.reason} onChange={(e) => setAmendmentForm((p) => ({ ...p, reason: e.target.value }))} />
                                <button className="btn-renew" onClick={() => submitAmendment(_id)}>{t('renterBookings.submitAmendment')}</button>
                              </div>
                              <div className="booking-chip-list">
                                {amendments.map((a) => (
                                  <span key={a._id} className="booking-chip">
                                    {a.status.toUpperCase()} | {a.reason || 'No reason'} | Rent: {a.proposedMonthlyRent ?? '-'}
                                  </span>
                                ))}
                                {amendments.length === 0 ? <span className="booking-chip">{t('renterBookings.noAmendmentHistory')}</span> : null}
                              </div>

                              <h4>{t('renterBookings.depositLedger')}</h4>
                              {ledger.summary ? (
                                <p className="workflow-hint">
                                  Held Rs {ledger.summary.netHeld} | Received Rs {ledger.summary.received} | Pending Rs {ledger.summary.pending}
                                </p>
                              ) : null}
                              <div className="booking-panel-grid">
                                <input type="number" placeholder={t('renterBookings.refundAmount')} value={refundForm.amount} onChange={(e) => setRefundForm((p) => ({ ...p, amount: e.target.value }))} />
                                <input type="text" placeholder={t('renterBookings.refundReason')} value={refundForm.reason} onChange={(e) => setRefundForm((p) => ({ ...p, reason: e.target.value }))} />
                                <button className="btn-renew" onClick={() => requestRefund(_id)}>{t('renterBookings.requestRefund')}</button>
                              </div>
                              <div className="booking-chip-list">
                                {(ledger.items || []).map((entry) => (
                                  <div key={entry._id} className="booking-chip">
                                    {entry.type} | Rs {entry.amount} | {entry.status}
                                    {entry.type === 'deduction' && entry.status === 'pending' ? (
                                      <>
                                        <button className="btn-renew" onClick={() => decideDeduction(_id, entry._id, 'approved')}>Approve</button>
                                        <button className="btn-renew" onClick={() => decideDeduction(_id, entry._id, 'rejected')}>Reject</button>
                                      </>
                                    ) : null}
                                  </div>
                                ))}
                                {(ledger.items || []).length === 0 ? <span className="booking-chip">{t('renterBookings.noDepositEntries')}</span> : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
              })}
            </tbody>
          </table>

          <div className="bookings-mobile-list">
            {displayBookings.map(({ _id, property, fromDate, toDate, status, paymentStatus, workflow, renewalStatus, bookingDetails, cancellationReason, cancelledByRole }) => {
              const requestInsight = getRequestInsight({ status, paymentStatus, bookingDetails, cancellationReason, cancelledByRole });
              return (
              <article key={`mobile-${_id}`} className="booking-mobile-card">
                <div className="booking-mobile-block">
                  <span className="booking-mobile-label">{t('renterBookings.property')}</span>
                  <strong className="booking-mobile-value">{property?.title || 'N/A'}</strong>
                </div>
                <div className="booking-mobile-grid">
                  <div className="booking-mobile-block">
                    <span className="booking-mobile-label">{t('renterBookings.from')}</span>
                    <span className="booking-mobile-value">{new Date(fromDate).toLocaleDateString()}</span>
                  </div>
                  <div className="booking-mobile-block">
                    <span className="booking-mobile-label">{t('renterBookings.to')}</span>
                    <span className="booking-mobile-value">{new Date(toDate).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="booking-mobile-block">
                  <span className="booking-mobile-label">{t('renterBookings.status')}</span>
                  <span className="booking-mobile-value">{status || 'N/A'}</span>
                </div>
                <div className="booking-mobile-block">
                  <span className="booking-mobile-label">{t('renterBookings.timeline')}</span>
                  {renderTimeline(workflow)}
                </div>
                <div className="booking-mobile-block">
                  <span className="booking-mobile-label">{t('renterBookings.nextStep')}</span>
                  <span className="workflow-hint booking-mobile-hint">
                    {isRequestsView ? `${requestInsight.title}: ${requestInsight.next}` : getWorkflowHint({ status, paymentStatus, workflow })}
                  </span>
                </div>
                {isRequestsView && (
                  <div className="booking-request-panel mobile">
                    <span>Who acts next: <strong>{requestInsight.actor}</strong></span>
                    <span>Payment: <strong>{paymentStatus === 'pending_verification' ? 'Waiting admin verification' : paymentStatus || 'pending'}</strong></span>
                  </div>
                )}
                <div className="booking-mobile-block">
                  <span className="booking-mobile-label">{t('renterBookings.payment')}</span>
                  <span className="booking-mobile-value">{paymentStatus === 'pending_verification' ? t('renterBookings.pendingVerification') : paymentStatus || 'pending'}</span>
                </div>
                <div className="booking-mobile-actions">
                  <button onClick={() => setSelectedProperty(property)}>{t('renterBookings.viewDetails')}</button>
                  <button className="btn-renew" onClick={() => toggleManage(_id)}>
                    {activeBookingId === _id ? t('renterBookings.hideManage') : t('renterBookings.manage')}
                  </button>
                  {status === 'Approved' && (
                    <button
                      className="btn-renew"
                      disabled={renewingId === _id || renewalStatus === 'pending'}
                      onClick={() => renewBooking(_id)}
                    >
                      {renewalStatus === 'pending' ? t('renterBookings.renewPending') : renewingId === _id ? t('renterBookings.requesting') : t('renterBookings.renewOneMonth')}
                    </button>
                  )}
                  {(status === 'Pending' || status === 'Approved') && (
                    <button className="btn-renew" onClick={() => cancelBooking(_id)}>{t('renterBookings.cancel')}</button>
                  )}
                </div>
                {activeBookingId === _id ? (
                  <div className="booking-panel booking-mobile-panel">
                    {panelLoading ? <p>Loading controls...</p> : null}
                    {panelError ? <p className="error">{panelError}</p> : null}
                    {!panelLoading ? (
                      <>
                        <h4>{t('renterBookings.leaseAmendment')}</h4>
                        <div className="booking-panel-grid">
                          <input type="date" value={amendmentForm.proposedFromDate} onChange={(e) => setAmendmentForm((p) => ({ ...p, proposedFromDate: e.target.value }))} />
                          <input type="date" value={amendmentForm.proposedToDate} onChange={(e) => setAmendmentForm((p) => ({ ...p, proposedToDate: e.target.value }))} />
                          <input type="number" placeholder={t('renterBookings.monthlyRentOptional')} value={amendmentForm.proposedMonthlyRent} onChange={(e) => setAmendmentForm((p) => ({ ...p, proposedMonthlyRent: e.target.value }))} />
                          <input type="text" placeholder={t('renterBookings.reason')} value={amendmentForm.reason} onChange={(e) => setAmendmentForm((p) => ({ ...p, reason: e.target.value }))} />
                          <button className="btn-renew" onClick={() => submitAmendment(_id)}>{t('renterBookings.submitAmendment')}</button>
                        </div>
                        <div className="booking-chip-list">
                          {amendments.map((a) => (
                            <span key={a._id} className="booking-chip">
                              {a.status.toUpperCase()} | {a.reason || 'No reason'} | Rent: {a.proposedMonthlyRent ?? '-'}
                            </span>
                          ))}
                          {amendments.length === 0 ? <span className="booking-chip">{t('renterBookings.noAmendmentHistory')}</span> : null}
                        </div>

                        <h4>{t('renterBookings.depositLedger')}</h4>
                        {ledger.summary ? (
                          <p className="workflow-hint booking-mobile-hint">
                            Held Rs {ledger.summary.netHeld} | Received Rs {ledger.summary.received} | Pending Rs {ledger.summary.pending}
                          </p>
                        ) : null}
                        <div className="booking-panel-grid">
                          <input type="number" placeholder={t('renterBookings.refundAmount')} value={refundForm.amount} onChange={(e) => setRefundForm((p) => ({ ...p, amount: e.target.value }))} />
                          <input type="text" placeholder={t('renterBookings.refundReason')} value={refundForm.reason} onChange={(e) => setRefundForm((p) => ({ ...p, reason: e.target.value }))} />
                          <button className="btn-renew" onClick={() => requestRefund(_id)}>{t('renterBookings.requestRefund')}</button>
                        </div>
                        <div className="booking-chip-list">
                          {(ledger.items || []).map((entry) => (
                            <div key={entry._id} className="booking-chip">
                              {entry.type} | Rs {entry.amount} | {entry.status}
                              {entry.type === 'deduction' && entry.status === 'pending' ? (
                                <>
                                  <button className="btn-renew" onClick={() => decideDeduction(_id, entry._id, 'approved')}>Approve</button>
                                  <button className="btn-renew" onClick={() => decideDeduction(_id, entry._id, 'rejected')}>Reject</button>
                                </>
                              ) : null}
                            </div>
                          ))}
                          {(ledger.items || []).length === 0 ? <span className="booking-chip">{t('renterBookings.noDepositEntries')}</span> : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
            })}
          </div>
        </>
      )}

      {selectedProperty && (
        <div className="modal-overlay" onClick={() => setSelectedProperty(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedProperty(null)} aria-label="Close popup" title="Close">
              ✕
            </button>
            <PropertyDetails id={selectedProperty._id} />
          </div>
        </div>
      )}
    </div>
  );
}
