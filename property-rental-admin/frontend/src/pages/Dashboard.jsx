import { useEffect, useState } from 'react';
import API from '../api';
import { formatDate } from '../utils';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [activityDays, setActivityDays] = useState(30);
  const [kpiColumns, setKpiColumns] = useState(3);
  const [viewName, setViewName] = useState('');
  const [views, setViews] = useState([]);
  const [selectedViewId, setSelectedViewId] = useState('');

  const load = async () => {
    try {
      const res = await API.get('/overview', { params: { activityDays } });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch dashboard');
    }
  };

  const loadViews = async () => {
    try {
      const res = await API.get('/dashboard-views');
      setViews(Array.isArray(res.data?.views) ? res.data.views : []);
    } catch {
      setViews([]);
    }
  };

  useEffect(() => {
    load();
    loadViews();
  }, []);

  const applyView = (viewId) => {
    setSelectedViewId(viewId);
    const selected = views.find((view) => view.id === viewId);
    if (!selected) return;
    setActivityDays(Number(selected.filters?.activityDays || 30));
    setKpiColumns(Number(selected.layout?.kpiColumns || 3));
  };

  const saveView = async () => {
    const trimmed = viewName.trim();
    if (!trimmed) return;
    const res = await API.post('/dashboard-views', {
      id: selectedViewId || undefined,
      name: trimmed,
      filters: { activityDays },
      layout: { kpiColumns },
    });
    setViews(Array.isArray(res.data?.views) ? res.data.views : []);
    setViewName('');
    if (!selectedViewId && Array.isArray(res.data?.views) && res.data.views[0]?.id) {
      setSelectedViewId(res.data.views[0].id);
    }
  };

  const deleteView = async () => {
    if (!selectedViewId) return;
    const res = await API.delete(`/dashboard-views/${selectedViewId}`);
    setViews(Array.isArray(res.data?.views) ? res.data.views : []);
    setSelectedViewId('');
  };

  const totals = data?.totals || {};
  const kpiValues = data?.kpis?.values || {};
  const alerts = data?.alerts || {};
  const payoutSummary = data?.payoutSummary || { allocated: 0, transferred: 0, pendingTransfer: 0, trend: [] };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">System health, workload alerts, and recent admin actions.</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="toolbar">
        <select value={selectedViewId} onChange={(e) => applyView(e.target.value)}>
          <option value="">Select saved view</option>
          {views.map((view) => (
            <option key={view.id} value={view.id}>{view.name}</option>
          ))}
        </select>
        <input
          type="number"
          min="7"
          max="365"
          value={activityDays}
          onChange={(e) => setActivityDays(Number(e.target.value || 30))}
          placeholder="Activity days"
        />
        <select value={kpiColumns} onChange={(e) => setKpiColumns(Number(e.target.value || 3))}>
          <option value={2}>2 KPI columns</option>
          <option value={3}>3 KPI columns</option>
          <option value={4}>4 KPI columns</option>
        </select>
        <input
          type="text"
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
          placeholder="Save current view as..."
        />
        <button className="btn" onClick={load}>Apply</button>
        <button className="btn secondary" onClick={saveView}>Save View</button>
        <button className="btn danger" onClick={deleteView} disabled={!selectedViewId}>Delete View</button>
      </div>

      <section className="kpi-grid" style={{ gridTemplateColumns: `repeat(${kpiColumns}, minmax(0, 1fr))` }}>
        <div className="kpi"><div className="kpi-label">Users</div><div className="kpi-value">{totals.users || 0}</div></div>
        <div className="kpi"><div className="kpi-label">Listings</div><div className="kpi-value">{totals.properties || 0}</div></div>
        <div className="kpi"><div className="kpi-label">Bookings</div><div className="kpi-value">{totals.bookings || 0}</div></div>
        <div className="kpi"><div className="kpi-label">Live MRR</div><div className="kpi-value">Rs. {kpiValues.liveMRR || 0}</div></div>
        <div className="kpi"><div className="kpi-label">Realized MRR</div><div className="kpi-value">Rs. {kpiValues.realizedMRR || 0}</div></div>
        <div className="kpi"><div className="kpi-label">Occupancy Rate</div><div className="kpi-value">{kpiValues.occupancyRate || 0}%</div></div>
        <div className="kpi"><div className="kpi-label">Platform Profit (Month)</div><div className="kpi-value">Rs. {kpiValues.platformProfit || 0}</div></div>
        <div className="kpi"><div className="kpi-label">Revenue</div><div className="kpi-value">Rs. {totals.revenue || 0}</div></div>
        <div className="kpi"><div className="kpi-label">Owner Distributed</div><div className="kpi-value">Rs. {totals.ownerDistributed || 0}</div></div>
        <div className="kpi"><div className="kpi-label">Profit</div><div className="kpi-value">Rs. {totals.profit || 0}</div></div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Alerts</h3>
        <div className="kpi-grid" style={{ marginTop: '0.8rem' }}>
          <div className="kpi"><div className="kpi-label">Pending Listings</div><div className="kpi-value">{alerts.pendingListings || 0}</div></div>
          <div className="kpi"><div className="kpi-label">Owner Requests</div><div className="kpi-value">{alerts.pendingOwnerVerifications || 0}</div></div>
          <div className="kpi"><div className="kpi-label">Open Complaints</div><div className="kpi-value">{alerts.openComplaints || 0}</div></div>
          <div className="kpi"><div className="kpi-label">Failed Payments</div><div className="kpi-value">{alerts.failedPayments || 0}</div></div>
        </div>
        {(alerts.actionableReminders || []).length > 0 ? (
          <div style={{ marginTop: '0.8rem' }}>
            {(alerts.actionableReminders || []).map((item) => (
              <p key={item.code} className="badge pending" style={{ marginRight: '0.45rem' }}>
                {item.title}: {item.count}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Owner Payout Summary</h3>
        <div className="kpi-grid" style={{ marginTop: '0.8rem' }}>
          <div className="kpi"><div className="kpi-label">Allocated</div><div className="kpi-value">Rs. {payoutSummary.allocated || 0}</div></div>
          <div className="kpi"><div className="kpi-label">Transferred</div><div className="kpi-value">Rs. {payoutSummary.transferred || 0}</div></div>
          <div className="kpi"><div className="kpi-label">Pending Transfer</div><div className="kpi-value">Rs. {payoutSummary.pendingTransfer || 0}</div></div>
        </div>
        <div className="table-wrap" style={{ marginTop: '0.7rem' }}>
          <table className="table">
            <thead>
              <tr><th>Month</th><th>Allocated</th><th>Transferred</th><th>Pending</th></tr>
            </thead>
            <tbody>
              {(payoutSummary.trend || []).map((row) => (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td>Rs. {row.allocated || 0}</td>
                  <td>Rs. {row.transferred || 0}</td>
                  <td>Rs. {row.pendingTransfer || 0}</td>
                </tr>
              ))}
              {(payoutSummary.trend || []).length === 0 ? (
                <tr><td colSpan="4">No payout trend yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Recent Activity</h3>
        <div className="table-wrap" style={{ marginTop: '0.7rem' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Entity ID</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentActivity || []).map((item) => (
                <tr key={item._id}>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{item.action}</td>
                  <td>{item.entityType}</td>
                  <td>{item.entityId}</td>
                </tr>
              ))}
              {(data?.recentActivity || []).length === 0 && (
                <tr><td colSpan="4">No activity yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
