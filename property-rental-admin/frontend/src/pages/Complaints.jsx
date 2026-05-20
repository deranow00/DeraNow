import { useEffect, useState } from 'react';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged, statusClass } from '../utils';

export default function Complaints() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });

  const load = async (nextPage = 1) => {
    const res = await API.get('/complaints', { params: { status: status || undefined, page: nextPage, limit: 20 } });
    const parsed = parsePaged(res.data);
    setRows(parsed.items);
    setMeta(parsed.meta);
  };

  useEffect(() => { load(); }, []);

  const change = async (id, nextStatus) => {
    await API.patch(`/complaints/${id}/status`, { status: nextStatus });
    load(meta.page);
  };

  return (
    <div>
      <div className="page-header"><div><h1>Complaints</h1><p className="page-subtitle">Handle complaints and mark resolution.</p></div></div>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All status</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
        </select>
        <button className="btn" onClick={() => load(1)}>Apply</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>User</th><th>Email</th><th>Subject</th><th>Complaint</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c._id}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.subject}</td>
                <td>{c.complaint}</td>
                <td><span className={`badge ${statusClass(c.status)}`}>{c.status}</span></td>
                <td>{formatDate(c.createdAt)}</td>
                <td>
                  {c.status !== 'resolved' ? (
                    <button className="btn" onClick={() => change(c._id, 'resolved')}>Mark Resolved</button>
                  ) : (
                    <button className="btn warn" onClick={() => change(c._id, 'pending')}>Reopen</button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="7">No complaints found.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination meta={meta} onPageChange={load} />
    </div>
  );
}
