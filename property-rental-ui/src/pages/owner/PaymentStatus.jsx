import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './PaymentStatus.css';

export default function PaymentStatus() {
  const { token } = useContext(AuthContext);
  const [data, setData] = useState({
    summary: {
      totalApprovedBookings: 0,
      paidByRenter: 0,
      pendingFromRenter: 0,
      transferredToOwner: 0,
      allocatedAmount: 0,
      transferredAmount: 0,
      pendingTransferAmount: 0,
    },
    payoutTrend: [],
    rows: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const summaryCards = [
    { label: 'Active Rentals', value: data.summary.totalApprovedBookings },
    { label: 'Paid by Renter', value: data.summary.paidByRenter },
    { label: 'Pending from Renter', value: data.summary.pendingFromRenter },
    { label: 'Transferred to You', value: data.summary.transferredToOwner },
    { label: 'Allocated', value: `Rs. ${data.summary.allocatedAmount || 0}` },
    { label: 'Transferred', value: `Rs. ${data.summary.transferredAmount || 0}` },
    { label: 'Pending Transfer', value: `Rs. ${data.summary.pendingTransferAmount || 0}` },
  ];

  const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '-');
  const toStatusClass = (value) => String(value || '').toLowerCase().replace(/\s+/g, '-');

  useEffect(() => {
    const fetchOwnerPaymentStatus = async () => {
      if (!token) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/api/payments/owner/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Failed to fetch payment status');
        setData({
          summary: payload.summary || data.summary,
          payoutTrend: Array.isArray(payload.payoutTrend) ? payload.payoutTrend : [],
          rows: Array.isArray(payload.rows) ? payload.rows : [],
        });
      } catch (err) {
        setError(err.message || 'Failed to fetch payment status');
      } finally {
        setLoading(false);
      }
    };
    fetchOwnerPaymentStatus();
  }, [token]);

  if (loading) return <p>Loading payment status...</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <div className="owner-payment-page">
      <div className="owner-payment-header">
        <h2>Rent & Payout Status</h2>
        <p>Track renter payment and whether admin has transferred your payout.</p>
      </div>

      <div className="owner-payment-cards">
        {summaryCards.map((card) => (
          <div className="owner-payment-card" key={card.label}>
            <h3>{card.value}</h3>
            <p>{card.label}</p>
          </div>
        ))}
      </div>

      <div className="owner-payment-trend">
        <h3>Monthly Payout Trend</h3>
        <div className="owner-payment-table-wrap">
          <table className="owner-payment-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Allocated</th>
                <th>Transferred</th>
                <th>Pending Transfer</th>
              </tr>
            </thead>
            <tbody>
              {data.payoutTrend.map((row) => (
                <tr key={row.month}>
                  <td data-label="Month">{row.month}</td>
                  <td data-label="Allocated">Rs. {row.allocated || 0}</td>
                  <td data-label="Transferred">Rs. {row.transferred || 0}</td>
                  <td data-label="Pending Transfer">Rs. {row.pendingTransfer || 0}</td>
                </tr>
              ))}
              {data.payoutTrend.length === 0 && (
                <tr>
                  <td colSpan="4">No payout trend data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="owner-payment-mobile-list owner-payment-trend-list">
          {data.payoutTrend.map((row) => (
            <article className="owner-payment-mobile-card" key={`trend-${row.month}`}>
              <div className="owner-payment-mobile-block owner-payment-mobile-head">
                <span className="owner-payment-mobile-label">Month</span>
                <strong className="owner-payment-mobile-value">{row.month}</strong>
              </div>
              <div className="owner-payment-mobile-grid">
                <div className="owner-payment-mobile-block">
                  <span className="owner-payment-mobile-label">Allocated</span>
                  <span className="owner-payment-mobile-value">Rs. {row.allocated || 0}</span>
                </div>
                <div className="owner-payment-mobile-block">
                  <span className="owner-payment-mobile-label">Transferred</span>
                  <span className="owner-payment-mobile-value">Rs. {row.transferred || 0}</span>
                </div>
                <div className="owner-payment-mobile-block">
                  <span className="owner-payment-mobile-label">Pending</span>
                  <span className="owner-payment-mobile-value">Rs. {row.pendingTransfer || 0}</span>
                </div>
              </div>
            </article>
          ))}
          {data.payoutTrend.length === 0 && (
            <p className="owner-payment-empty">No payout trend data available.</p>
          )}
        </div>
      </div>

      <div className="owner-payment-table-wrap">
        <table className="owner-payment-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Renter</th>
              <th>Monthly Rent</th>
              <th>Booking From</th>
              <th>Renter Payment</th>
              <th>Admin Payout</th>
              <th>Net to Owner</th>
              <th>Last Payment</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.bookingId}>
                <td data-label="Property">{row.propertyTitle}</td>
                <td data-label="Renter">
                  <div>{row.renterName}</div>
                  <small>{row.renterEmail}</small>
                </td>
                <td data-label="Monthly Rent">Rs. {row.monthlyRent}</td>
                <td data-label="Booking From">{formatDate(row.bookingFrom)}</td>
                <td data-label="Renter Payment">
                  <span className={`owner-chip ${toStatusClass(row.renterPaymentStatus)}`}>
                    {row.renterPaymentStatus}
                  </span>
                </td>
                <td data-label="Admin Payout">
                  <span className={`owner-chip ${toStatusClass(row.ownerPayoutStatus)}`}>
                    {row.ownerPayoutStatus}
                  </span>
                </td>
                <td data-label="Net to Owner">Rs. {row.ownerAmount || 0}</td>
                <td data-label="Last Payment">
                  {row.latestPaymentAmount
                    ? `Rs. ${row.latestPaymentAmount} (${new Date(row.latestPaymentAt).toLocaleDateString()})`
                    : '-'}
                </td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan="8">No approved rentals found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="owner-payment-mobile-list">
        {data.rows.map((row) => (
          <article className="owner-payment-mobile-card" key={`mobile-${row.bookingId}`}>
            <div className="owner-payment-mobile-block owner-payment-mobile-head">
              <span className="owner-payment-mobile-label">Property</span>
              <strong className="owner-payment-mobile-value">{row.propertyTitle}</strong>
            </div>
            <div className="owner-payment-mobile-block">
              <span className="owner-payment-mobile-label">Renter</span>
              <span className="owner-payment-mobile-value">
                {row.renterName}
                <small>{row.renterEmail}</small>
              </span>
            </div>
            <div className="owner-payment-mobile-grid">
              <div className="owner-payment-mobile-block">
                <span className="owner-payment-mobile-label">Monthly Rent</span>
                <span className="owner-payment-mobile-value">Rs. {row.monthlyRent}</span>
              </div>
              <div className="owner-payment-mobile-block">
                <span className="owner-payment-mobile-label">Booking From</span>
                <span className="owner-payment-mobile-value">{formatDate(row.bookingFrom)}</span>
              </div>
              <div className="owner-payment-mobile-block">
                <span className="owner-payment-mobile-label">Net to Owner</span>
                <span className="owner-payment-mobile-value">Rs. {row.ownerAmount || 0}</span>
              </div>
              <div className="owner-payment-mobile-block">
                <span className="owner-payment-mobile-label">Last Payment</span>
                <span className="owner-payment-mobile-value">
                  {row.latestPaymentAmount
                    ? `Rs. ${row.latestPaymentAmount} (${formatDate(row.latestPaymentAt)})`
                    : '-'}
                </span>
              </div>
            </div>
            <div className="owner-payment-mobile-statuses">
              <div className="owner-payment-mobile-block">
                <span className="owner-payment-mobile-label">Renter Payment</span>
                <span className={`owner-chip ${toStatusClass(row.renterPaymentStatus)}`}>
                  {row.renterPaymentStatus}
                </span>
              </div>
              <div className="owner-payment-mobile-block">
                <span className="owner-payment-mobile-label">Admin Payout</span>
                <span className={`owner-chip ${toStatusClass(row.ownerPayoutStatus)}`}>
                  {row.ownerPayoutStatus}
                </span>
              </div>
            </div>
          </article>
        ))}
        {data.rows.length === 0 && <p className="owner-payment-empty">No approved rentals found.</p>}
      </div>
    </div>
  );
}
