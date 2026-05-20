import { useEffect, useState } from 'react';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged } from '../utils';

export default function Reviews() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 30, totalPages: 1 });

  const load = async (nextPage = 1) => {
    const res = await API.get('/reviews', { params: { page: nextPage, limit: 30 } });
    const parsed = parsePaged(res.data);
    setRows(parsed.items);
    setMeta(parsed.meta);
  };

  useEffect(() => { load(); }, []);

  const remove = async (propertyId, reviewId) => {
    await API.delete(`/reviews/${propertyId}/${reviewId}`);
    load(meta.page);
  };

  return (
    <div>
      <div className="page-header"><div><h1>Reviews</h1><p className="page-subtitle">Review moderation and spam cleanup.</p></div></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Property</th><th>User</th><th>Rating</th><th>Comment</th><th>Created</th><th>Action</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.reviewId}>
                <td>{r.propertyTitle}</td>
                <td>{r.user?.email || '-'}</td>
                <td>{r.rating}</td>
                <td>{r.comment || '-'}</td>
                <td>{formatDate(r.createdAt)}</td>
                <td><button className="btn danger" onClick={() => remove(r.propertyId, r.reviewId)}>Delete</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="6">No reviews found.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination meta={meta} onPageChange={load} />
    </div>
  );
}
