import { useEffect, useState } from 'react';
import API from '../api';

const currency = (value) => `Rs. ${Number(value || 0).toLocaleString()}`;

export default function RevenueCommand() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.get('/revenue-command');
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load revenue command center');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const headline = data?.headline || {};
  const payoutAging = data?.payoutAging || { buckets: [], oldestPendingDays: 0 };
  const churnRisk = data?.churnRisk || { atRiskCount: 0, highRiskCount: 0, items: [] };
  const anomalies = data?.anomalies || [];
  const trend = data?.trend || [];
  const paymentHealth7d = data?.paymentHealth7d || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Revenue Command Center</h1>
          <p className="page-subtitle">Live MRR, payout aging, churn risk, and anomaly alerts in one screen.</p>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Live MRR</div><div className="kpi-value">{currency(headline.liveMRR)}</div></div>
        <div className="kpi"><div className="kpi-label">Realized MRR</div><div className="kpi-value">{currency(headline.realizedMRR)}</div></div>
        <div className="kpi"><div className="kpi-label">Pending Payout</div><div className="kpi-value">{currency(headline.pendingPayoutTotal)}</div></div>
        <div className="kpi"><div className="kpi-label">MoM Change</div><div className="kpi-value">{headline.monthOverMonthChangePct || 0}%</div></div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Anomaly Alerts</h3>
        {anomalies.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No anomaly alerts right now.</p>
        ) : (
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: '0.7rem' }}>
            {anomalies.map((item) => (
              <div className="kpi" key={item.code}>
                <div className="kpi-label">{item.severity.toUpperCase()}</div>
                <div style={{ fontWeight: 700, marginTop: '0.25rem' }}>{item.title}</div>
                <div style={{ marginTop: '0.35rem', color: 'var(--text-muted)' }}>{item.detail}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Payout Aging</h3>
        <div className="table-wrap" style={{ marginTop: '0.7rem' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Age Bucket</th>
                <th>Count</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payoutAging.buckets.map((bucket) => (
                <tr key={bucket.bucket}>
                  <td>{bucket.bucket}</td>
                  <td>{bucket.count}</td>
                  <td>{currency(bucket.amount)}</td>
                </tr>
              ))}
              {payoutAging.buckets.length === 0 && (
                <tr><td colSpan="3">No pending payouts.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: '0.7rem', color: 'var(--text-muted)' }}>
          Oldest pending payout: {payoutAging.oldestPendingDays || 0} day(s)
        </p>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Churn Risk Watchlist</h3>
        <p style={{ color: 'var(--text-muted)' }}>
          At-risk leases: {churnRisk.atRiskCount || 0} | High risk: {churnRisk.highRiskCount || 0}
        </p>
        <div className="table-wrap" style={{ marginTop: '0.7rem' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Renter</th>
                <th>Days To End</th>
                <th>Payment Status</th>
                <th>Risk Score</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {churnRisk.items.map((item) => (
                <tr key={item.bookingId}>
                  <td>{item.property}</td>
                  <td>{item.renter}</td>
                  <td>{item.daysToEnd}</td>
                  <td>{item.paymentStatus}</td>
                  <td>{item.score}</td>
                  <td>{item.tier}</td>
                </tr>
              ))}
              {churnRisk.items.length === 0 && (
                <tr><td colSpan="6">No churn-risk bookings detected.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Revenue Trend (Last 3+ Months)</h3>
        <div className="table-wrap" style={{ marginTop: '0.7rem' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Paid Revenue</th>
                <th>Paid Transactions</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((row) => (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td>{currency(row.revenue)}</td>
                  <td>{row.paidTransactions}</td>
                </tr>
              ))}
              {trend.length === 0 && (
                <tr><td colSpan="3">No trend data available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Payment Health (Last 7 Days)</h3>
        <div className="kpi-grid" style={{ marginTop: '0.7rem' }}>
          <div className="kpi"><div className="kpi-label">Paid</div><div className="kpi-value">{paymentHealth7d.paid || 0}</div></div>
          <div className="kpi"><div className="kpi-label">Failed</div><div className="kpi-value">{paymentHealth7d.failed || 0}</div></div>
          <div className="kpi"><div className="kpi-label">Pending</div><div className="kpi-value">{paymentHealth7d.pending || 0}</div></div>
          <div className="kpi"><div className="kpi-label">Failed Rate</div><div className="kpi-value">{paymentHealth7d.failedRatePct || 0}%</div></div>
        </div>
      </section>
    </div>
  );
}
