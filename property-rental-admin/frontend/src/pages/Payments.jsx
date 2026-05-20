import { useEffect, useState } from 'react';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged, statusClass } from '../utils';
import './Payments.css';

export default function Payments() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [payoutStatus, setPayoutStatus] = useState('');
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [remarks, setRemarks] = useState({});
  const [commissionInputs, setCommissionInputs] = useState({});

  const load = async (nextPage = 1) => {
    const res = await API.get('/payments', {
      params: {
        status: status || undefined,
        payoutStatus: payoutStatus || undefined,
        page: nextPage,
        limit: 20,
      },
    });
    const parsed = parsePaged(res.data);
    setRows(parsed.items);
    setMeta(parsed.meta);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id, nextStatus) => {
    await API.patch(`/payments/${id}/status`, { status: nextStatus, adminRemark: remarks[id] || '' });
    load(meta.page);
  };

  const allocateOwner = async (id) => {
    const value = commissionInputs[id];
    const commissionPercent = value === '' || value == null ? undefined : Number(value);
    await API.post(`/payments/${id}/allocate-owner`, {
      commissionPercent,
      payoutNote: remarks[id] || '',
    });
    load(meta.page);
  };

  const markTransferred = async (id) => {
    await API.patch(`/payments/${id}/transfer-owner`, {
      payoutNote: remarks[id] || '',
    });
    load(meta.page);
  };

  return (
    <div className="payments-page">
      <div className="page-header"><div><h1>Payments</h1><p className="page-subtitle">Monitor transactions, failures, and refunds.</p></div></div>
      <div className="toolbar payments-toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All status</option>
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
          <option value="Failed">Failed</option>
          <option value="Refunded">Refunded</option>
        </select>
        <select value={payoutStatus} onChange={(e) => setPayoutStatus(e.target.value)}>
          <option value="">All payout states</option>
          <option value="Unallocated">Unallocated</option>
          <option value="Allocated">Allocated</option>
          <option value="Transferred">Transferred</option>
        </select>
        <button className="btn payments-apply-btn" onClick={() => load(1)}>Apply Filters</button>
      </div>
      <div className="table-wrap payments-table-wrap">
        <table className="table">
          <thead><tr><th>PID</th><th>Reference</th><th>Renter</th><th>Property</th><th>Owner</th><th>Period</th><th>Months</th><th>Amount</th><th>Method</th><th>Status</th><th>Payout</th><th>Commission%</th><th>Commission</th><th>Owner Receives</th><th>Date</th><th>Remark</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p._id}>
                <td>{p.pid || '-'}</td>
                <td>{p.transactionRef || '-'}</td>
                <td>{p.renter?.email || '-'}</td>
                <td>{p.booking?.property?.title || '-'}</td>
                <td>{p.ownerId?.name || p.booking?.property?.ownerId?.name || '-'}</td>
                <td>
                  {p.paymentPeriodStart && p.paymentPeriodEnd
                    ? `${new Date(p.paymentPeriodStart).toLocaleDateString()} - ${new Date(p.paymentPeriodEnd).toLocaleDateString()}`
                    : '-'}
                </td>
                <td>{p.monthsCount || 1}</td>
                <td>Rs. {p.amount}</td>
                <td>{p.paymentMethod || '-'}</td>
                <td><span className={`badge ${statusClass(p.status)}`}>{p.status}</span></td>
                <td><span className={`badge ${statusClass(p.payoutStatus || 'Unallocated')}`}>{p.payoutStatus || 'Unallocated'}</span></td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={commissionInputs[p._id] ?? p.commissionPercent ?? 10}
                    onChange={(e) => setCommissionInputs((prev) => ({ ...prev, [p._id]: e.target.value }))}
                    placeholder="10"
                    className="commission-input"
                  />
                </td>
                <td>Rs. {p.commissionAmount ?? 0}</td>
                <td>Rs. {p.ownerAmount ?? 0}</td>
                <td>{formatDate(p.createdAt)}</td>
                <td>
                  <input
                    value={remarks[p._id] || ''}
                    onChange={(e) => setRemarks((prev) => ({ ...prev, [p._id]: e.target.value }))}
                    placeholder="Optional remark"
                    className="remark-input"
                  />
                </td>
                <td className="payment-actions-cell">
                  <div className="payment-action-row">
                    <button className="btn action-btn paid-btn" onClick={() => updateStatus(p._id, 'Paid')}>Mark Paid</button>
                    <button className="btn action-btn warn" onClick={() => updateStatus(p._id, 'Pending')}>Mark Pending</button>
                    <button className="btn action-btn danger" onClick={() => updateStatus(p._id, 'Failed')}>Mark Failed</button>
                    <button className="btn action-btn secondary" onClick={() => updateStatus(p._id, 'Refunded')}>Refunded</button>
                  </div>
                  <div className="payment-action-row">
                    <button
                      className="btn action-btn allocate-btn"
                      onClick={() => allocateOwner(p._id)}
                      disabled={p.status !== 'Paid'}
                      title={p.status !== 'Paid' ? 'Payment must be Paid first' : 'Allocate net payout to owner'}
                    >
                      Allocate Owner
                    </button>
                    <button
                      className="btn action-btn secondary"
                      onClick={() => markTransferred(p._id)}
                      disabled={p.payoutStatus !== 'Allocated'}
                      title={p.payoutStatus !== 'Allocated' ? 'Allocate payout first' : 'Mark payout transferred to owner'}
                    >
                      Mark Transferred
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="17">No payments found.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination meta={meta} onPageChange={load} />
    </div>
  );
}
