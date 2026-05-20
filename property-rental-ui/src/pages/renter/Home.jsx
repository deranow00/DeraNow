import React, { useEffect, useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import './Home.css';
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

export default function RenterDashboard() {
  const { token } = useContext(AuthContext);
  const [stats, setStats] = useState({
    bookings: 0,
    favorites: 0,
    bookingStatusCount: { Approved: 0, Pending: 0, Rejected: 0 },
    bookingStats: [],
    recent: [],
  });

  useEffect(() => {
    const fetchStats = async () => {
      if (!token) return;

      try {
        const res = await fetch(`${API_BASE_URL}/api/dashboard/renter`, {
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

  const getStatusClass = (status) => String(status || 'pending').toLowerCase().replace(/\s+/g, '-');

  const statusData = [
    { name: 'Approved', value: stats.bookingStatusCount?.Approved || 0 },
    { name: 'Pending', value: stats.bookingStatusCount?.Pending || 0 },
    { name: 'Rejected', value: stats.bookingStatusCount?.Rejected || 0 },
  ];
  const totalStatusCount = statusData.reduce((sum, item) => sum + item.value, 0);
  const approvedRate = totalStatusCount
    ? Math.round(((stats.bookingStatusCount?.Approved || 0) / totalStatusCount) * 100)
    : 0;
  const topBookingMonth = Array.isArray(stats.bookingStats)
    ? stats.bookingStats.reduce(
        (max, item) => (item?.count > (max?.count || 0) ? item : max),
        null
      )
    : null;

  return (
    <div className="dashboard-container renter-dashboard">
      <header className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">Overview</p>
          <h2>Renter Dashboard</h2>
          <p className="dashboard-subtitle">
            Stay on top of your bookings, favorites, and monthly rental activity.
          </p>
        </div>
      </header>

      <div className="dashboard-cards">
        <div className="dashboard-stat-card">
          <p className="stat-label">Total Bookings</p>
          <h3>{stats.bookings ?? 0}</h3>
        </div>
        <div className="dashboard-stat-card">
          <p className="stat-label">Favorites</p>
          <h3>{stats.favorites ?? 0}</h3>
        </div>
      </div>

      <div className="dashboard-grid-two">
        <section className="action-panel">
          <div className="section-head">
            <h3>Quick Actions</h3>
            <p>Go straight to the tasks you use most.</p>
          </div>
          <div className="action-grid">
            <Link to="/renter/listings" className="action-link">Browse Listings</Link>
            <Link to="/renter/bookings" className="action-link">View Bookings</Link>
            <Link to="/renter/message" className="action-link">Open Messages</Link>
            <Link to="/renter/payments" className="action-link">Manage Payments</Link>
          </div>
        </section>

        <section className="action-panel">
          <div className="section-head">
            <h3>Insights</h3>
            <p>Short performance signals from your account data.</p>
          </div>
          <div className="insight-grid">
            <div className="insight-card">
              <p className="insight-label">Approval Rate</p>
              <p className="insight-value">{approvedRate}%</p>
            </div>
            <div className="insight-card">
              <p className="insight-label">Pending Requests</p>
              <p className="insight-value">{stats.bookingStatusCount?.Pending || 0}</p>
            </div>
            <div className="insight-card">
              <p className="insight-label">Peak Month</p>
              <p className="insight-value">{topBookingMonth?.month || '-'}</p>
            </div>
          </div>
        </section>
      </div>

      <div className="chart-section">
        <div className="chart-card">
          <div className="section-head">
            <h3>Booking Status Distribution</h3>
            <p>How your booking requests are currently distributed.</p>
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
            <h3>Bookings Per Month</h3>
            <p>Monthly volume of your booking activity.</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.bookingStats}>
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
          <h3>Recent Bookings</h3>
          <p>Your latest booking records and their current status.</p>
        </div>
        {Array.isArray(stats.recent) && stats.recent.length > 0 ? (
          <ul className="dashboard-list">
            {stats.recent.map((booking) => (
              <li key={booking._id}>
                <div>
                  <p className="item-title">{booking.property?.title || 'Unknown Property'}</p>
                  <p className="item-subtitle">{formatCurrency(booking.property?.price)}</p>
                </div>
                <span className={`status-pill ${getStatusClass(booking.status)}`}>
                  {booking.status || 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No recent bookings found.</p>
        )}
      </div>
    </div>
  );
}
