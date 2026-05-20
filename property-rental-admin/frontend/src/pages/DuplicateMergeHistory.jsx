import { useEffect, useMemo, useState } from 'react';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged, statusClass } from '../utils';

export default function DuplicateMergeHistory() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [filters, setFilters] = useState({ q: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (nextPage = 1) => {
    try {
      setLoading(true);
      setError('');
      const res = await API.get('/duplicates/merge-history', {
        params: {
          page: nextPage,
          limit: 20,
          q: filters.q || undefined,
          status: filters.status || undefined,
        },
      });
      const parsed = parsePaged(res.data);
      setItems(parsed.items);
      setMeta(parsed.meta);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load merge history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, row) => {
        if (row.status === 'completed') acc.completed += 1;
        if (row.status === 'rolled_back') acc.rolledBack += 1;
        if (row.status === 'expired') acc.expired += 1;
        return acc;
      },
      { completed: 0, rolledBack: 0, expired: 0 }
    );
  }, [items]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Merge History</h1>
          <p className="page-subtitle">Audit trail of duplicate merges, rollback window, and operator actions.</p>
        </div>
      </div>

      <section className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Visible Rows</div><div className="kpi-value">{items.length}</div></div>
        <div className="kpi"><div className="kpi-label">Completed</div><div className="kpi-value">{totals.completed}</div></div>
        <div className="kpi"><div className="kpi-label">Rolled Back</div><div className="kpi-value">{totals.rolledBack}</div></div>
        <div className="kpi"><div className="kpi-label">Expired</div><div className="kpi-value">{totals.expired}</div></div>
      </section>

      <div className="toolbar" style={{ marginTop: '0.9rem' }}>
        <input
          type="text"
          placeholder="Search merge/user/admin"
          value={filters.q}
          onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
        >
          <option value="">All status</option>
          <option value="completed">completed</option>
          <option value="rolled_back">rolled_back</option>
          <option value="expired">expired</option>
        </select>
        <button className="btn" onClick={() => load(1)} disabled={loading}>{loading ? 'Loading...' : 'Apply'}</button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="card" style={{ marginTop: '1rem' }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Merge</th>
                <th>Source</th>
                <th>Target</th>
                <th>Status</th>
                <th>Rollback</th>
                <th>Performed By</th>
                <th>At</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row._id}>
                  <td>
                    <div><strong>{String(row._id).slice(-8)}</strong></div>
                    <div><small>refs moved: {(row.movedRefs || []).length}</small></div>
                  </td>
                  <td>
                    <div><strong>{row.sourceUserId?.name || '-'}</strong></div>
                    <div>{row.sourceUserId?.email || '-'}</div>
                  </td>
                  <td>
                    <div><strong>{row.targetUserId?.name || '-'}</strong></div>
                    <div>{row.targetUserId?.email || '-'}</div>
                  </td>
                  <td>
                    <span className={`badge ${statusClass(row.status)}`}>{row.status}</span>
                  </td>
                  <td>
                    <div><small>expires: {formatDate(row.rollbackExpiresAt)}</small></div>
                    <div><small>rolled back: {row.rolledBackAt ? formatDate(row.rolledBackAt) : '-'}</small></div>
                  </td>
                  <td>{row.performedBy?.displayName || row.performedBy?.username || '-'}</td>
                  <td>{formatDate(row.createdAt)}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr><td colSpan="7">No merge history found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination meta={meta} onPageChange={load} />
      </section>
    </div>
  );
}
