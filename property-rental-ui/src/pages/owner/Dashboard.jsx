import React, { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';

const COLORS = ['#2a9d8f', '#e9c46a', '#e76f51'];

export default function Dashboard() {
  const { token, user } = useContext(AuthContext);
  const [stats, setStats] = useState({
    totalProperties: 0,
    totalBookings: 0,
    totalFavorites: 0,
    bookingStatusCount: { Approved: 0, Pending: 0, Rejected: 0 },
    recentProperties: [],
    propertyStats: [],
    ownerPaymentRows: [],
    kpis: {
      values: {
        liveMRR: 0,
        realizedMRR: 0,
        occupancyRate: 0,
        ownerProfit: 0,
      },
    },
  });

  useEffect(() => {
    const fetchStats = async () => {
      if (!token) return;

      try {
        const res = await fetch(`${API_BASE_URL}/api/dashboard/owner`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error('Dashboard load error', err);
      }
    };
    fetchStats();
  }, [token]);

  const formatCurrency = (amount) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return 'N/A';
    return new Intl.NumberFormat('en-NP', {
      style: 'currency',
      currency: 'NPR',
      maximumFractionDigits: 0,
    }).format(numericAmount);
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return '-';
    return new Date(dateValue).toLocaleDateString();
  };

  const toSlug = (value) => String(value || '').toLowerCase().replace(/\s+/g, '-');
  const verificationStatus = user?.kycStatus || 'unsubmitted';
  const ownerVerified = verificationStatus === 'verified';
  const paidPayments = Array.isArray(stats.ownerPaymentRows)
    ? stats.ownerPaymentRows.filter((row) => toSlug(row.paymentStatus) === 'paid').length
    : 0;
  const pendingPayments = Array.isArray(stats.ownerPaymentRows)
    ? stats.ownerPaymentRows.filter((row) => toSlug(row.paymentStatus) !== 'paid').length
    : 0;
  const bookingToPropertyRatio = stats.totalProperties
    ? (Number(stats.totalBookings || 0) / Number(stats.totalProperties || 1)).toFixed(1)
    : '0.0';
  const kpiValues = stats.kpis?.values || {};

  const statusData = [
    { name: 'Approved', value: stats.bookingStatusCount?.Approved || 0 },
    { name: 'Pending', value: stats.bookingStatusCount?.Pending || 0 },
    { name: 'Rejected', value: stats.bookingStatusCount?.Rejected || 0 },
  ];

  return (
    <div className="dashboard-container owner-dashboard">
      <header className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">Portfolio</p>
          <h2>Owner Dashboard</h2>
          <p className="dashboard-subtitle">
            Manage property performance, booking outcomes, and renter payment visibility.
          </p>
        </div>
      </header>

      <section className="owner-add-property-cta" aria-label="Add properties">
        <div>
          <span className={`status-pill verification-status ${toSlug(verificationStatus)}`}>
            KYC: {verificationStatus}
          </span>
          <h3>Add Properties</h3>
          <p>
            List your room, flat, or house on DeraNow and start receiving renter visits after admin approval.
          </p>
        </div>
        <Link
          to={ownerVerified ? '/owner/add' : '/owner/profile'}
          className={`owner-add-property-button ${!ownerVerified ? 'locked' : ''}`}
        >
          <span className="owner-add-property-plus">+</span>
          <span>{ownerVerified ? 'Add Property' : 'Complete KYC First'}</span>
        </Link>
      </section>

      {!ownerVerified && (
        <section className="owner-kyc-required-banner">
          <div>
            <span className={`status-pill verification-status ${toSlug(verificationStatus)}`}>
              KYC: {verificationStatus}
            </span>
            <h3>KYC is required to add properties</h3>
            <p>
              DeraNow uses the existing profile KYC flow for owner trust. Once your KYC is verified,
              you can submit properties for admin review.
            </p>
          </div>
          <Link to="/owner/profile" className="owner-kyc-banner-action">Update KYC</Link>
        </section>
      )}

        <div className="dashboard-cards">
        <div className="dashboard-stat-card">
          <p className="stat-label">Total Properties</p>
          <h3>{stats.totalProperties ?? 0}</h3>
        </div>
        <div className="dashboard-stat-card">
          <p className="stat-label">Total Bookings</p>
          <h3>{stats.totalBookings ?? 0}</h3>
        </div>
        <div className="dashboard-stat-card">
          <p className="stat-label">Favorites</p>
          <h3>{stats.totalFavorites ?? 0}</h3>
        </div>
      </div>

      <div className="dashboard-grid-two">
        <section className="action-panel">
          <div className="section-head">
            <h3>Quick Actions</h3>
            <p>Jump to high-frequency management tasks.</p>
          </div>
          <div className="action-grid">
            <Link
              to={ownerVerified ? '/owner/add' : '/owner/profile'}
              className={`action-link ${!ownerVerified ? 'action-link-warning' : ''}`}
            >
              {ownerVerified ? 'Add Property' : 'Complete KYC to Add Property'}
            </Link>
            <Link to="/owner/requests" className="action-link">Review Bookings</Link>
            <Link to="/owner/messages" className="action-link">Open Messages</Link>
            <Link to="/owner/payment-status" className="action-link">Check Rent Status</Link>
          </div>
        </section>

        <section className="action-panel">
          <div className="section-head">
            <h3>Insights</h3>
            <p>Operational indicators from your current portfolio data.</p>
          </div>
          <div className="insight-grid">
            <div className="insight-card">
              <p className="insight-label">Paid Accounts</p>
              <p className="insight-value">{paidPayments}</p>
            </div>
            <div className="insight-card">
              <p className="insight-label">Pending Accounts</p>
              <p className="insight-value">{pendingPayments}</p>
            </div>
            <div className="insight-card">
              <p className="insight-label">Bookings / Property</p>
              <p className="insight-value">{bookingToPropertyRatio}</p>
            </div>
            <div className="insight-card">
              <p className="insight-label">Live MRR</p>
              <p className="insight-value">{formatCurrency(kpiValues.liveMRR)}</p>
            </div>
            <div className="insight-card">
              <p className="insight-label">Realized MRR</p>
              <p className="insight-value">{formatCurrency(kpiValues.realizedMRR)}</p>
            </div>
            <div className="insight-card">
              <p className="insight-label">Occupancy</p>
              <p className="insight-value">{kpiValues.occupancyRate || 0}%</p>
            </div>
            <div className="insight-card">
              <p className="insight-label">Owner Profit (Month)</p>
              <p className="insight-value">{formatCurrency(kpiValues.ownerProfit)}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="owner-verification-card" id="owner-verification">
        <div className="section-head">
          <h3>KYC Verification</h3>
          <p>This uses the existing profile KYC flow. Verified owners can add properties and receive stronger renter confidence.</p>
        </div>
        <div className="verification-status-row">
          <span className="verification-label">Current Status</span>
          <span className={`status-pill verification-status ${toSlug(verificationStatus)}`}>
            {verificationStatus}
          </span>
        </div>
        {verificationStatus === 'rejected' && user?.kycRejectReason && (
          <p className="verification-note error">
            Last rejection reason: {user.kycRejectReason}
          </p>
        )}
        {(verificationStatus === 'unsubmitted' || verificationStatus === 'rejected') && (
          <Link to="/owner/profile" className="verification-btn">
            Submit KYC from Profile
          </Link>
        )}
        {verificationStatus === 'pending' && (
          <p className="verification-note warning">
            Your KYC request is pending admin review.
          </p>
        )}
      </section>

      <div className="chart-section">
        <div className="chart-card">
          <div className="section-head">
            <h3>Booking Status Distribution</h3>
            <p>A snapshot of accepted, pending, and rejected bookings.</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="section-head">
            <h3>Properties Added Per Month</h3>
            <p>Monthly trend of portfolio growth.</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.propertyStats || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#2a9d8f" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="recent-properties">
        <div className="section-head">
          <h3>Recent Properties</h3>
          <p>Latest properties added to your portfolio.</p>
        </div>
        {Array.isArray(stats.recentProperties) && stats.recentProperties.length > 0 ? (
          <ul className="dashboard-list">
            {stats.recentProperties.map((p) => (
              <li key={p._id}>
                <div>
                  <p className="item-title">{p.title}</p>
                  <p className="item-subtitle">{formatCurrency(p.price)}</p>
                </div>
                <span className={`status-pill ${toSlug(p.status || 'available')}`}>
                  {p.status || 'Available'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No recent properties.</p>
        )}
      </div>

      <div className="owner-payment-status">
        <div className="section-head">
          <h3>Renter Payment Status</h3>
          <p>Payment and booking data for approved renter agreements.</p>
        </div>
        {Array.isArray(stats.ownerPaymentRows) && stats.ownerPaymentRows.length > 0 ? (
          <div className="payment-status-table-wrap">
            <table className="payment-status-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Renter</th>
                  <th>Monthly Rent</th>
                  <th>Booking From</th>
                  <th>Status</th>
                  <th>Last Payment</th>
                </tr>
              </thead>
              <tbody>
                {stats.ownerPaymentRows.map((row) => (
                  <tr key={row.bookingId}>
                    <td>{row.propertyTitle}</td>
                    <td>
                      <p className="item-title">{row.renterName}</p>
                      <p className="item-subtitle">{row.renterEmail}</p>
                    </td>
                    <td>{formatCurrency(row.monthlyRent)}</td>
                    <td>{formatDate(row.fromDate)}</td>
                    <td>
                      <span className={`payment-chip ${toSlug(row.paymentStatus)}`}>
                        {row.paymentStatus}
                      </span>
                    </td>
                    <td>
                      {row.latestPaymentAmount
                        ? `${formatCurrency(row.latestPaymentAmount)} (${formatDate(row.latestPaymentAt)})`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No approved bookings with payment records yet.</p>
        )}
      </div>
    </div>
  );
}
