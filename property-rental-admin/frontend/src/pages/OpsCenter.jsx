import { useEffect, useState } from 'react';
import API from '../api';

export default function OpsCenter() {
  const [inbox, setInbox] = useState({ summary: {}, items: [] });
  const [sla, setSla] = useState(null);
  const [recon, setRecon] = useState({ totalIssues: 0, items: [] });
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState('properties_approve');
  const [bulkResult, setBulkResult] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setError('');
      const [inboxRes, slaRes, reconRes] = await Promise.all([
        API.get('/ops/inbox'),
        API.get('/ops/sla'),
        API.get('/ops/reconciliation'),
      ]);
      setInbox(inboxRes.data || { summary: {}, items: [] });
      setSla(slaRes.data || null);
      setRecon(reconRes.data || { totalIssues: 0, items: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load ops center');
    }
  };

  useEffect(() => { load(); }, []);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const runBulk = async () => {
    if (!selectedIds.length) return;
    try {
      const res = await API.post('/ops/bulk-action', { action: bulkAction, ids: selectedIds });
      setBulkResult(`Action ${res.data.action}: ${res.data.modified}/${res.data.requested} updated`);
      setSelectedIds([]);
      load();
    } catch (err) {
      setBulkResult(err.response?.data?.error || 'Bulk action failed');
    }
  };

  const bucket = (obj, key) => Number(obj?.[key] || 0);

  return (
    <div>
      <div className="page-header"><div><h1>Ops Center</h1><p className="page-subtitle">Workflow inbox, bulk actions, SLA heatmap, and reconciliation checks.</p></div></div>
      {error && <p className="error">{error}</p>}

      <section className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Total Inbox</div><div className="kpi-value">{inbox.summary?.total || 0}</div></div>
        <div className="kpi"><div className="kpi-label">Pending Listings</div><div className="kpi-value">{inbox.summary?.propertyPending || 0}</div></div>
        <div className="kpi"><div className="kpi-label">KYC Pending</div><div className="kpi-value">{inbox.summary?.kycPending || 0}</div></div>
        <div className="kpi"><div className="kpi-label">Open Complaints</div><div className="kpi-value">{inbox.summary?.complaintOpen || 0}</div></div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Bulk Actions</h3>
        <div className="toolbar" style={{ marginTop: '0.7rem' }}>
          <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
            <option value="properties_approve">Approve Properties</option>
            <option value="properties_reject">Reject Properties</option>
            <option value="bookings_approve">Approve Bookings</option>
            <option value="bookings_reject">Reject Bookings</option>
            <option value="complaints_resolve">Resolve Complaints</option>
            <option value="payments_mark_transferred">Mark Payout Transferred</option>
          </select>
          <button className="btn" onClick={runBulk} disabled={!selectedIds.length}>Run On Selected ({selectedIds.length})</button>
          {bulkResult && <span>{bulkResult}</span>}
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Workflow Inbox</h3>
        <div className="table-wrap" style={{ marginTop: '0.7rem' }}>
          <table className="table">
            <thead><tr><th></th><th>Type</th><th>Title</th><th>Details</th><th>Created</th></tr></thead>
            <tbody>
              {(inbox.items || []).map((item) => (
                <tr key={`${item.type}-${item.entityId}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.entityId)}
                      onChange={() => toggleSelect(item.entityId)}
                    />
                  </td>
                  <td>{item.type}</td>
                  <td>{item.title}</td>
                  <td>{item.subtitle}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {(inbox.items || []).length === 0 && <tr><td colSpan="5">No workflow items.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>SLA Dashboard</h3>
        <div className="kpi-grid" style={{ marginTop: '0.7rem' }}>
          <div className="kpi">
            <div className="kpi-label">Listings 8+d</div>
            <div className="kpi-value">{bucket(sla?.listings, '8+d')}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Owner Verif 8+d</div>
            <div className="kpi-value">{bucket(sla?.ownerVerification, '8+d')}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Complaints 8+d</div>
            <div className="kpi-value">{bucket(sla?.complaints, '8+d')}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Payouts 8+d</div>
            <div className="kpi-value">{bucket(sla?.payouts, '8+d')}</div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Reconciliation</h3>
        <p className="page-subtitle">Total issues: {recon.totalIssues || 0}</p>
        <div className="table-wrap" style={{ marginTop: '0.7rem' }}>
          <table className="table">
            <thead><tr><th>Type</th><th>Booking</th><th>Payment</th><th>Severity</th><th>Message</th></tr></thead>
            <tbody>
              {(recon.items || []).map((item, idx) => (
                <tr key={`${item.type}-${idx}`}>
                  <td>{item.type}</td>
                  <td>{item.bookingId || '-'}</td>
                  <td>{item.paymentId || '-'}</td>
                  <td>{item.severity}</td>
                  <td>{item.message}</td>
                </tr>
              ))}
              {(recon.items || []).length === 0 && <tr><td colSpan="5">No reconciliation issues.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
