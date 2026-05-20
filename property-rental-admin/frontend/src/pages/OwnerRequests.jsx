import { useEffect, useState } from 'react';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged } from '../utils';

export default function OwnerRequests() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });

  const load = async (nextPage = 1) => {
    const res = await API.get('/owner-requests', { params: { page: nextPage, limit: 20 } });
    const parsed = parsePaged(res.data);
    setRows(parsed.items);
    setMeta(parsed.meta);
  };

  useEffect(() => { load(); }, []);

  const update = async (id, status) => {
    await API.patch(`/owner-requests/${id}`, { status });
    load(meta.page);
  };

  return (
    <div>
      <div className="page-header"><div><h1>Owner Requests</h1><p className="page-subtitle">Approve or reject owner verification submissions.</p></div></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Citizenship</th><th>ID Photo</th><th>Requested</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td>{r.name}</td>
                <td>{r.email}</td>
                <td>{r.citizenshipNumber || '-'}</td>
                <td>
                  {r.ownerVerificationDocument?.imageUrl ? (
                    <a
                      href={r.ownerVerificationDocument.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="View ID image"
                    >
                      <img
                        src={r.ownerVerificationDocument.imageUrl}
                        alt={`${r.name} ID`}
                        style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }}
                      />
                    </a>
                  ) : (
                    <span style={{ color: '#b91c1c', fontWeight: 600 }}>Not uploaded</span>
                  )}
                </td>
                <td>{formatDate(r.ownerVerificationDocument?.submittedAt || r.createdAt)}</td>
                <td>
                  <button className="btn" onClick={() => update(r._id, 'verified')}>Approve</button>{' '}
                  <button className="btn danger" onClick={() => update(r._id, 'rejected')}>Reject</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="6">No pending owner requests.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination meta={meta} onPageChange={load} />
    </div>
  );
}
