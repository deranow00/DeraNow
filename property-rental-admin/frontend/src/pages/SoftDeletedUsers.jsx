import { useEffect, useMemo, useState } from 'react';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged, statusClass } from '../utils';

export default function SoftDeletedUsers() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (nextPage = 1) => {
    try {
      setLoading(true);
      setError('');
      const res = await API.get('/duplicates/soft-deleted-users', {
        params: { page: nextPage, limit: 20, q: q || undefined },
      });
      const parsed = parsePaged(res.data);
      setItems(parsed.items);
      setMeta(parsed.meta);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load soft deleted users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const owners = items.filter((row) => row.role === 'owner').length;
    const renters = items.filter((row) => row.role === 'renter').length;
    return { owners, renters };
  }, [items]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Soft Deleted Duplicate Users</h1>
          <p className="page-subtitle">Users deactivated by duplicate merge with linked superior account trace.</p>
        </div>
      </div>

      <section className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Visible Rows</div><div className="kpi-value">{items.length}</div></div>
        <div className="kpi"><div className="kpi-label">Owners</div><div className="kpi-value">{stats.owners}</div></div>
        <div className="kpi"><div className="kpi-label">Renters</div><div className="kpi-value">{stats.renters}</div></div>
        <div className="kpi"><div className="kpi-label">Page</div><div className="kpi-value">{meta.page || 1}</div></div>
      </section>

      <div className="toolbar" style={{ marginTop: '0.9rem' }}>
        <input
          type="text"
          placeholder="Search user/email/citizenship"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn" onClick={() => load(1)} disabled={loading}>{loading ? 'Loading...' : 'Search'}</button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="card" style={{ marginTop: '1rem' }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>KYC / Owner Verify</th>
                <th>Merged Into</th>
                <th>Merged At</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row._id}>
                  <td>
                    <div><strong>{row.name || '-'}</strong></div>
                    <div>{row.email || '-'}</div>
                    <div><small>citizenship: {row.citizenshipNumber || '-'}</small></div>
                  </td>
                  <td>{row.role || '-'}</td>
                  <td>
                    <span className={`badge ${statusClass(row.mergeStatus || 'inactive')}`}>{row.mergeStatus || 'inactive'}</span>
                  </td>
                  <td>
                    <span className={`badge ${statusClass(row.kycStatus)}`}>KYC: {row.kycStatus || 'unknown'}</span>{' '}
                    <span className={`badge ${statusClass(row.ownerVerificationStatus)}`}>Owner: {row.ownerVerificationStatus || 'unknown'}</span>
                  </td>
                  <td>
                    <div><strong>{row.mergedIntoUserId?.name || '-'}</strong></div>
                    <div>{row.mergedIntoUserId?.email || '-'}</div>
                  </td>
                  <td>{formatDate(row.mergedAt)}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr><td colSpan="6">No soft deleted duplicate users found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination meta={meta} onPageChange={load} />
      </section>
    </div>
  );
}
