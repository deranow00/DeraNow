import { Fragment, useEffect, useState } from 'react';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged, statusClass } from '../utils';

export default function Bookings() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [openBookingId, setOpenBookingId] = useState('');
  const [amendments, setAmendments] = useState([]);
  const [ledger, setLedger] = useState({ summary: null, items: [] });
  const [panelError, setPanelError] = useState('');
  const [panelLoading, setPanelLoading] = useState(false);

  const load = async (nextPage = 1) => {
    const res = await API.get('/bookings', { params: { status: status || undefined, page: nextPage, limit: 20 } });
    const parsed = parsePaged(res.data);
    setRows(parsed.items);
    setMeta(parsed.meta);
  };

  useEffect(() => { load(); }, []);

  const setBookingStatus = async (id, nextStatus) => {
    await API.patch(`/bookings/${id}/status`, { status: nextStatus });
    load(meta.page);
  };

  const loadPanelDetails = async (bookingId) => {
    try {
      setPanelError('');
      setPanelLoading(true);
      const [amendmentRes, ledgerRes] = await Promise.all([
        API.get(`/bookings/${bookingId}/amendments`),
        API.get(`/bookings/${bookingId}/deposit-ledger`),
      ]);
      setAmendments(amendmentRes.data?.items || []);
      setLedger({
        summary: ledgerRes.data?.summary || null,
        items: ledgerRes.data?.items || [],
      });
    } catch (err) {
      setPanelError(err.response?.data?.error || 'Failed to load booking controls');
      setAmendments([]);
      setLedger({ summary: null, items: [] });
    } finally {
      setPanelLoading(false);
    }
  };

  const openPanel = async (bookingId) => {
    if (openBookingId === bookingId) {
      setOpenBookingId('');
      return;
    }
    setOpenBookingId(bookingId);
    await loadPanelDetails(bookingId);
  };

  const decideAmendment = async (bookingId, amendmentId, nextStatus) => {
    await API.patch(`/bookings/${bookingId}/amendments/${amendmentId}`, { status: nextStatus });
    await loadPanelDetails(bookingId);
  };

  const updateLedger = async (bookingId, entryId, nextStatus) => {
    await API.patch(`/bookings/${bookingId}/deposit-ledger/${entryId}`, { status: nextStatus });
    await loadPanelDetails(bookingId);
  };

  return (
    <div>
      <div className="page-header"><div><h1>Bookings</h1><p className="page-subtitle">Track booking lifecycle and intervene in disputes.</p></div></div>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All status</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <button className="btn" onClick={() => load(1)}>Apply</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Property</th><th>Owner</th><th>Renter</th><th>From</th><th>To</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <Fragment key={b._id}>
                <tr>
                  <td>{b.property?.title || '-'}</td>
                  <td>{b.property?.ownerId?.name || b.property?.ownerId?.email || '-'}</td>
                  <td>{b.renter?.name || '-'}</td>
                  <td>{formatDate(b.fromDate)}</td>
                  <td>{formatDate(b.toDate)}</td>
                  <td><span className={`badge ${statusClass(b.status)}`}>{b.status}</span></td>
                  <td className="admin-actions-cell">
                    <div className="admin-action-row">
                      <button className="btn admin-action-btn" onClick={() => setBookingStatus(b._id, 'Approved')}>Approve</button>
                      <button className="btn admin-action-btn danger" onClick={() => setBookingStatus(b._id, 'Rejected')}>Reject</button>
                      <button className="btn admin-action-btn warn" onClick={() => setBookingStatus(b._id, 'Pending')}>Pending</button>
                      <button className="btn admin-action-btn secondary" onClick={() => openPanel(b._id)}>
                        {openBookingId === b._id ? 'Hide Controls' : 'Amendments & Deposit'}
                      </button>
                    </div>
                  </td>
                </tr>
                {openBookingId === b._id ? (
                  <tr key={`${b._id}-panel`}>
                    <td colSpan="7">
                      {panelLoading ? (
                        <p>Loading controls...</p>
                      ) : (
                        <div className="card" style={{ margin: '0.4rem 0' }}>
                          {panelError ? <p className="error">{panelError}</p> : null}
                          <h3 style={{ marginTop: 0 }}>Lease Amendments</h3>
                          <div className="table-wrap" style={{ marginBottom: '0.8rem' }}>
                            <table className="table">
                              <thead><tr><th>Requested By</th><th>Proposed Dates</th><th>Proposed Rent</th><th>Status</th><th>Reason</th><th>Actions</th></tr></thead>
                              <tbody>
                                {amendments.map((a) => (
                                  <tr key={a._id}>
                                    <td>{a.requestedBy?.name || a.requestedBy?.email || '-'}</td>
                                    <td>{a.proposedFromDate ? formatDate(a.proposedFromDate) : '-'} to {a.proposedToDate ? formatDate(a.proposedToDate) : '-'}</td>
                                    <td>{a.proposedMonthlyRent ?? '-'}</td>
                                    <td><span className={`badge ${statusClass(a.status)}`}>{a.status}</span></td>
                                    <td>{a.reason || '-'}</td>
                                    <td>
                                      {a.status === 'pending' ? (
                                        <div className="admin-action-row">
                                          <button className="btn admin-action-btn" onClick={() => decideAmendment(b._id, a._id, 'approved')}>Approve</button>
                                          <button className="btn admin-action-btn danger" onClick={() => decideAmendment(b._id, a._id, 'rejected')}>Reject</button>
                                          <button className="btn admin-action-btn warn" onClick={() => decideAmendment(b._id, a._id, 'cancelled')}>Cancel</button>
                                        </div>
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                {amendments.length === 0 ? <tr><td colSpan="6">No amendments.</td></tr> : null}
                              </tbody>
                            </table>
                          </div>

                          <h3>Deposit Ledger</h3>
                          {ledger.summary ? (
                            <p className="page-subtitle">
                              Held: Rs {ledger.summary.netHeld} | Received: Rs {ledger.summary.received} | Pending: Rs {ledger.summary.pending}
                            </p>
                          ) : null}
                          <div className="table-wrap">
                            <table className="table">
                              <thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>Reason</th><th>By</th><th>Actions</th></tr></thead>
                              <tbody>
                                {(ledger.items || []).map((entry) => (
                                  <tr key={entry._id}>
                                    <td>{entry.type}</td>
                                    <td>Rs {entry.amount}</td>
                                    <td><span className={`badge ${statusClass(entry.status)}`}>{entry.status}</span></td>
                                    <td>{entry.reason || '-'}</td>
                                    <td>{entry.createdBy?.name || entry.createdBy?.email || '-'}</td>
                                    <td>
                                      {entry.status === 'pending' ? (
                                        <div className="admin-action-row">
                                          <button className="btn admin-action-btn" onClick={() => updateLedger(b._id, entry._id, 'approved')}>Approve</button>
                                          <button className="btn admin-action-btn danger" onClick={() => updateLedger(b._id, entry._id, 'rejected')}>Reject</button>
                                        </div>
                                      ) : entry.type === 'refund_requested' && entry.status === 'approved' ? (
                                        <button className="btn admin-action-btn secondary" onClick={() => updateLedger(b._id, entry._id, 'paid')}>Mark Paid</button>
                                      ) : '—'}
                                    </td>
                                  </tr>
                                ))}
                                {(ledger.items || []).length === 0 ? <tr><td colSpan="6">No ledger entries.</td></tr> : null}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
            {rows.length === 0 && <tr><td colSpan="7">No bookings found.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination meta={meta} onPageChange={load} />
    </div>
  );
}
