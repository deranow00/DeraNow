import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './PaymentPage.css';

const QR_IMAGE_URL =
  import.meta.env.VITE_MANUAL_PAYMENT_QR_URL ||
  'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';

const normalizeStatus = (status) => String(status || '').toLowerCase();
const startOfMonth = (d) => new Date(new Date(d).getFullYear(), new Date(d).getMonth(), 1);
const endOfMonth = (d) =>
  new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 1, 0, 23, 59, 59, 999);
const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, 1);
const monthDiffInclusive = (start, end) =>
  (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
const formatDateOnly = (date) =>
  new Date(date).toLocaleDateString(undefined, { timeZone: 'UTC' });
const formatMonth = (date) =>
  new Date(date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

export default function PaymentPage() {
  const { user, token } = useContext(AuthContext);
  const renterId = user?._id || '';

  const [bookings, setBookings] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState('pay');
  const [invoice, setInvoice] = useState(null);
  const [transactionRefs, setTransactionRefs] = useState({});
  const [nowTick, setNowTick] = useState(Date.now());

  const latestPaymentByBooking = useMemo(() => {
    const map = {};
    history.forEach((item) => {
      const bookingId = item.booking?._id || item.booking;
      if (!bookingId) return;
      if (!map[bookingId] || new Date(item.createdAt) > new Date(map[bookingId].createdAt)) {
        map[bookingId] = item;
      }
    });
    return map;
  }, [history]);

  const summary = useMemo(() => {
    const total = history.length;
    const paid = history.filter((h) => h.status === 'Paid').length;
    const pending = history.filter((h) => h.status === 'Pending').length;
    const failed = history.filter((h) => h.status === 'Failed').length;
    return { total, paid, pending, failed };
  }, [history]);

  const dueByBooking = useMemo(() => {
    const map = {};
    const now = new Date(nowTick);
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);

    bookings.forEach((booking) => {
      const bookingId = booking._id;
      const paymentsForBooking = history.filter((h) => (h.booking?._id || h.booking) === bookingId);
      const latestPaid = paymentsForBooking
        .filter((h) => h.status === 'Paid')
        .sort(
          (a, b) =>
            new Date(b.paymentPeriodEnd || b.createdAt) - new Date(a.paymentPeriodEnd || a.createdAt)
        )[0];

      const hasPending = paymentsForBooking.some((h) => h.status === 'Pending');
      const paidEnd = latestPaid
        ? startOfMonth(latestPaid.paymentPeriodEnd || latestPaid.createdAt)
        : null;
      const dueStart = paidEnd ? addMonths(paidEnd, 1) : startOfMonth(booking.fromDate);

      if (dueStart > currentMonthStart) {
        map[bookingId] = {
          hasDue: false,
          hasPending,
          dueStart,
          dueEnd: currentMonthEnd,
          monthsCount: 0,
          amount: 0,
        };
        return;
      }

      const monthsCount = monthDiffInclusive(dueStart, currentMonthStart);
      map[bookingId] = {
        hasDue: true,
        hasPending,
        dueStart,
        dueEnd: currentMonthEnd,
        monthsCount,
        amount: Number(booking.property?.price || 0) * monthsCount,
      };
    });

    return map;
  }, [bookings, history, nowTick]);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!renterId || !token) return;

    const fetchBookings = async () => {
      setLoadingBookings(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/bookings/approved/${renterId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setBookings(data);
        else setError(data.error || 'Failed to fetch bookings');
      } catch {
        setError('Server not reachable.');
      } finally {
        setLoadingBookings(false);
      }
    };

    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/payments/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setHistory(data);
        else setError(data.error || 'Failed to fetch payment history');
      } catch {
        setError('Server not reachable.');
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchBookings();
    fetchHistory();
  }, [renterId, token]);

  const refreshHistory = async () => {
    const res = await fetch(`${API_BASE_URL}/api/payments/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) setHistory(data);
  };

  const handleSubmitPaymentRequest = async (bookingId, amount, isPaid, hasPendingRequest) => {
    setError('');
    setSuccessMsg('');

    if (!user || !token) {
      setError('You must be logged in to submit a payment request.');
      return;
    }

    if (isPaid) {
      setError('This booking is already paid.');
      return;
    }

    if (hasPendingRequest) {
      setError('Payment request already submitted. Please wait for admin verification.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bookingId,
          amount,
          paymentMethod: 'QR',
          transactionRef: transactionRefs[bookingId] || '',
          pid: `QR-${bookingId}-${Date.now()}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit payment request');

      setSuccessMsg('Payment request submitted. Admin will verify and update status.');
      setBookings((prev) =>
        prev.map((b) => (b._id === bookingId ? { ...b, paymentStatus: 'pending_verification' } : b))
      );
      await refreshHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  const openInvoice = async (paymentId) => {
    const res = await fetch(`${API_BASE_URL}/api/payments/${paymentId}/invoice`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) setInvoice(data);
  };

  return (
    <div className="payment-page">
      <section className="payment-hero">
        <h1>Payments</h1>
        <p>Pay through QR and submit request for admin verification.</p>
      </section>

      <section className="payment-summary">
        <article className="summary-card"><span>Total</span><strong>{summary.total}</strong></article>
        <article className="summary-card paid"><span>Paid</span><strong>{summary.paid}</strong></article>
        <article className="summary-card pending"><span>Pending</span><strong>{summary.pending}</strong></article>
        <article className="summary-card failed"><span>Failed</span><strong>{summary.failed}</strong></article>
      </section>

      <div className="tabs">
        <button className={activeTab === 'pay' ? 'active' : ''} onClick={() => setActiveTab('pay')}>
          Pay Via QR
        </button>
        <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>
          Payment History
        </button>
      </div>

      {successMsg && <p className="alert success">{successMsg}</p>}
      {error && <p className="alert error">{error}</p>}

      {activeTab === 'pay' && (
        <div className="cards-grid">
          {loadingBookings ? (
            <p className="empty-state">Loading bookings...</p>
          ) : bookings.length === 0 ? (
            <p className="empty-state">No approved bookings to pay for.</p>
          ) : (
            bookings.map((b) => {
              const latestPayment = latestPaymentByBooking[b._id];
              const due = dueByBooking[b._id];
              const isPaid = !due?.hasDue;
              const hasPendingRequest =
                due?.hasPending ||
                b.paymentStatus === 'pending_verification' ||
                latestPayment?.status === 'Pending';

              return (
                <div key={b._id} className="payment-card">
                  <div className="card-head">
                    <h3>{b.property.title}</h3>
                    <span className={`status-chip ${isPaid ? 'paid' : hasPendingRequest ? 'pending' : 'ready'}`}>
                      {isPaid ? 'Paid' : hasPendingRequest ? 'Pending Verification' : 'Ready To Submit'}
                    </span>
                  </div>

                  <div className="meta-row"><span>Monthly Rent</span><strong>Rs. {b.property.price}</strong></div>
                  <div className="meta-row">
                    <span>Due Period</span>
                    <strong>
                      {due?.hasDue
                        ? `${formatMonth(due.dueStart)} - ${formatMonth(due.dueEnd)}`
                        : 'No Due'}
                    </strong>
                  </div>
                  <div className="meta-row"><span>Months Due</span><strong>{due?.monthsCount || 0}</strong></div>
                  <div className="meta-row"><span>Total Due</span><strong>Rs. {due?.amount || 0}</strong></div>

                  <div className="qr-box">
                    <p>Scan this QR, complete payment, then submit request.</p>
                    <img src={QR_IMAGE_URL} alt="Payment QR" className="qr-image" />
                    <input
                      type="text"
                      placeholder="Transaction Reference (optional)"
                      value={transactionRefs[b._id] || ''}
                      onChange={(e) =>
                        setTransactionRefs((prev) => ({ ...prev, [b._id]: e.target.value }))
                      }
                    />
                  </div>

                  <button
                    className="btn-primary"
                    disabled={isPaid || hasPendingRequest}
                    onClick={() =>
                      handleSubmitPaymentRequest(b._id, due?.amount || b.property.price, isPaid, hasPendingRequest)
                    }
                  >
                    {isPaid ? 'No Due' : hasPendingRequest ? 'Verification Pending' : 'I Have Paid - Submit'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="cards-grid">
          {loadingHistory ? (
            <p className="empty-state">Loading payment history...</p>
          ) : history.length === 0 ? (
            <p className="empty-state">No payments made yet.</p>
          ) : (
            history.map((h) => (
              <div key={h._id} className="history-card">
                <div className="card-head">
                  <h3>{h.booking?.property?.title || 'N/A'}</h3>
                  <span className={`status-chip ${normalizeStatus(h.status)}`}>{h.status}</span>
                </div>
                <div className="meta-row"><span>Booking</span><strong>{h.booking?._id}</strong></div>
                <div className="meta-row"><span>Amount</span><strong>Rs. {h.amount}</strong></div>
                <div className="meta-row">
                  <span>Period</span>
                  <strong>
                    {h.paymentPeriodStart && h.paymentPeriodEnd
                      ? `${formatMonth(h.paymentPeriodStart)} - ${formatMonth(h.paymentPeriodEnd)}`
                      : formatMonth(h.createdAt)}
                  </strong>
                </div>
                <div className="meta-row"><span>Months</span><strong>{h.monthsCount || 1}</strong></div>
                <div className="meta-row"><span>Method</span><strong>{h.paymentMethod}</strong></div>
                <div className="meta-row"><span>Reference</span><strong>{h.transactionRef || 'N/A'}</strong></div>
                <div className="meta-row"><span>Date</span><strong>{new Date(h.createdAt).toLocaleString()}</strong></div>
                <button className="btn-secondary" onClick={() => openInvoice(h._id)}>View Invoice</button>
              </div>
            ))
          )}
        </div>
      )}

      {invoice && (
        <div className="modal-overlay" onClick={() => setInvoice(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setInvoice(null)} aria-label="Close popup" title="Close">✕</button>
            <h3>Invoice {invoice.invoiceNumber}</h3>
            <p>Status: {invoice.status}</p>
            <p>Issued: {formatDateOnly(invoice.issuedAt)}</p>
            <p>Property: {invoice.property?.title}</p>
            <p>Owner: {invoice.owner?.name}</p>
            <p>Amount: {invoice.amount} NPR</p>
            <p>
              Booking: {formatDateOnly(invoice.bookingPeriod?.from)} -{' '}
              {formatDateOnly(invoice.bookingPeriod?.to)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
