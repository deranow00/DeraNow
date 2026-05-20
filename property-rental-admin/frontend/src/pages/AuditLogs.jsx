import { useEffect, useState } from 'react';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged } from '../utils';

export default function AuditLogs() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 });
  const [error, setError] = useState('');
  const [diffData, setDiffData] = useState(null);
  const [diffLoading, setDiffLoading] = useState('');
  const [filters, setFilters] = useState({
    q: '',
    action: '',
    entityType: '',
    dateFrom: '',
    dateTo: '',
  });

  const load = async (nextPage = 1) => {
    try {
      setError('');
      const res = await API.get('/audit-logs', {
        params: {
          page: nextPage,
          limit: 50,
          q: filters.q || undefined,
          action: filters.action || undefined,
          entityType: filters.entityType || undefined,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
        },
      });
      const parsed = parsePaged(res.data);
      setRows(parsed.items);
      setMeta(parsed.meta);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load audit logs');
      setRows([]);
    }
  };

  useEffect(() => { load(); }, []);

  const viewDiff = async (logId) => {
    try {
      setDiffLoading(logId);
      const res = await API.get(`/audit-logs/${logId}/diff`);
      setDiffData(res.data || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load audit diff');
      setDiffData(null);
    } finally {
      setDiffLoading('');
    }
  };

  const exportCsv = async () => {
    const res = await API.get('/audit-logs', {
      params: {
        export: 'csv',
        q: filters.q || undefined,
        action: filters.action || undefined,
        entityType: filters.entityType || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      },
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'audit-logs.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header"><div><h1>Audit Logs</h1><p className="page-subtitle">Trace all critical admin changes.</p></div></div>
      <div className="toolbar">
        <input
          type="text"
          placeholder="Search action/entity/id"
          value={filters.q}
          onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
        />
        <input
          type="text"
          placeholder="Action"
          value={filters.action}
          onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
        />
        <input
          type="text"
          placeholder="Entity type"
          value={filters.entityType}
          onChange={(e) => setFilters((prev) => ({ ...prev, entityType: e.target.value }))}
        />
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
        />
        <button className="btn" onClick={() => load(1)}>Apply Filters</button>
        <button className="btn secondary" onClick={exportCsv}>Export CSV</button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>Details</th><th>Diff</th></tr></thead>
          <tbody>
            {rows.map((log) => (
              <tr key={log._id}>
                <td>{formatDate(log.createdAt)}</td>
                <td>{log.adminId?.username || '-'}</td>
                <td>{log.action}</td>
                <td>{log.entityType}</td>
                <td>{log.entityId}</td>
                <td><code>{JSON.stringify(log.details || {})}</code></td>
                <td>
                  <button
                    className="btn secondary"
                    onClick={() => viewDiff(log._id)}
                    disabled={diffLoading === log._id}
                  >
                    {diffLoading === log._id ? 'Loading...' : 'View Diff'}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="7">No audit logs yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {diffData ? (
        <section className="card" style={{ marginTop: '1rem' }}>
          <div className="page-header" style={{ marginBottom: '0.6rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>Audit Diff</h3>
              <p className="page-subtitle">
                {diffData.log?.action || '-'} on {diffData.log?.entityType || '-'}:{diffData.log?.entityId || '-'}
              </p>
            </div>
            <button className="btn secondary" onClick={() => setDiffData(null)}>Close</button>
          </div>
          {Array.isArray(diffData.diff?.changedFields) && diffData.diff.changedFields.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                <tbody>
                  {diffData.diff.changedFields.map((item) => (
                    <tr key={item.field}>
                      <td>{item.field}</td>
                      <td><code>{JSON.stringify(item.before)}</code></td>
                      <td><code>{JSON.stringify(item.after)}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <p className="page-subtitle">No field-level diff found. Raw payload shown below.</p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Before</th><th>After</th></tr></thead>
                  <tbody>
                    <tr>
                      <td><code>{JSON.stringify(diffData.diff?.before ?? null)}</code></td>
                      <td><code>{JSON.stringify(diffData.diff?.after ?? null)}</code></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : null}
      <Pagination meta={meta} onPageChange={load} />
    </div>
  );
}
