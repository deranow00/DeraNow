import React, { useContext, useEffect, useState } from 'react';
import './MyBookings.css';
import PropertyDetails from '../../components/common/PropertyDetails';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { useLanguage } from '../../context/LanguageContext';

const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export default function Bookings() {
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

  return (
    <div className="bookings-container renter-bookings-container">
      <h2>{t('renterBookings.title')}</h2>
      {loading ? (
        <p>{t('renterBookings.loading')}</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : bookings.length === 0 ? (
        <p>{t('renterBookings.empty')}</p>
      ) : (
        <>
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
              {bookings.map(({ _id, property, fromDate, toDate, status, paymentStatus, workflow, renewalStatus }) => (
                <React.Fragment key={`table-${_id}`}>
                  <tr>
                    <td data-label={t('renterBookings.property')}>{property?.title || 'N/A'}</td>
                    <td data-label={t('renterBookings.from')}>{new Date(fromDate).toLocaleDateString()}</td>
                    <td data-label={t('renterBookings.to')}>{new Date(toDate).toLocaleDateString()}</td>
                    <td data-label={t('renterBookings.status')}>{status || 'N/A'}</td>
                    <td data-label={t('renterBookings.timeline')}>{renderTimeline(workflow)}</td>
                    <td data-label={t('renterBookings.nextStep')}><span className="workflow-hint">{getWorkflowHint({ status, paymentStatus, workflow })}</span></td>
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
              ))}
            </tbody>
          </table>

          <div className="bookings-mobile-list">
            {bookings.map(({ _id, property, fromDate, toDate, status, paymentStatus, workflow, renewalStatus }) => (
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
                  <span className="workflow-hint booking-mobile-hint">{getWorkflowHint({ status, paymentStatus, workflow })}</span>
                </div>
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
            ))}
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
