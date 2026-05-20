import { useEffect, useState } from 'react';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged, statusClass } from '../utils';

export default function Properties() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });

  const load = async (nextPage = 1) => {
    const res = await API.get('/properties', { params: { q: q || undefined, status: status || undefined, page: nextPage, limit: 20 } });
    const parsed = parsePaged(res.data);
    setRows(parsed.items);
    setMeta(parsed.meta);
  };

  useEffect(() => { load(); }, []);

  const changeStatus = async (id, nextStatus) => {
    await API.patch(`/properties/${id}/status`, { status: nextStatus });
    load(meta.page);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this property?')) return;
    await API.delete(`/properties/${id}`);
    load(meta.page);
  };

  return (
    <div>
      <div className="page-header"><div><h1>Properties</h1><p className="page-subtitle">Moderate listings and enforce listing quality.</p></div></div>
      <div className="toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title/location/description" />
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
          <thead><tr><th>Title</th><th>Owner</th><th>Location</th><th>Price</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p._id}>
                <td>{p.title}</td>
                <td>{p.ownerId?.name || '-'}</td>
                <td>{p.location}</td>
                <td>Rs. {p.price}</td>
                <td><span className={`badge ${statusClass(p.status)}`}>{p.status}</span></td>
                <td>{formatDate(p.createdAt)}</td>
                <td className="admin-actions-cell">
                  <div className="admin-action-row">
                    <button className="btn admin-action-btn" onClick={() => changeStatus(p._id, 'Approved')}>Approve</button>
                    <button className="btn admin-action-btn warn" onClick={() => changeStatus(p._id, 'Pending')}>Pending</button>
                    <button className="btn admin-action-btn danger" onClick={() => changeStatus(p._id, 'Rejected')}>Reject</button>
                    <button className="btn admin-action-btn secondary" onClick={() => remove(p._id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="7">No properties found.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination meta={meta} onPageChange={load} />
    </div>
  );
}
