import { useEffect, useState } from 'react';
import API from '../api';
import Pagination from '../components/Pagination';
import { formatDate, parsePaged } from '../utils';

export default function AdminNotes() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [filters, setFilters] = useState({ entityType: '', entityId: '', tag: '', q: '' });
  const [form, setForm] = useState({ entityType: 'booking', entityId: '', note: '', tags: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async (nextPage = 1) => {
    try {
      setError('');
      const res = await API.get('/notes', {
        params: {
          page: nextPage,
          limit: 25,
          entityType: filters.entityType || undefined,
          entityId: filters.entityId || undefined,
          tag: filters.tag || undefined,
          q: filters.q || undefined,
        },
      });
      const parsed = parsePaged(res.data);
      setRows(parsed.items);
      setMeta(parsed.meta);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch notes');
      setRows([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!form.entityType || !form.entityId.trim()) {
      setError('Entity type and entity id are required');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const tags = form.tags
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      await API.put(`/notes/${form.entityType}/${form.entityId.trim()}`, {
        note: form.note,
        tags,
      });
      setForm((prev) => ({ ...prev, note: '', tags: '' }));
      await load(1);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Admin Notes</h1>
          <p className="page-subtitle">Attach searchable notes and tags to bookings, users, properties, and payments.</p>
        </div>
      </div>

      <section className="card">
        <h3>Add / Update Note</h3>
        <div className="toolbar" style={{ marginTop: '0.7rem' }}>
          <select
            value={form.entityType}
            onChange={(e) => setForm((prev) => ({ ...prev, entityType: e.target.value }))}
          >
            <option value="booking">booking</option>
            <option value="property">property</option>
            <option value="payment">payment</option>
            <option value="complaint">complaint</option>
            <option value="user">user</option>
          </select>
          <input
            type="text"
            placeholder="Entity ID"
            value={form.entityId}
            onChange={(e) => setForm((prev) => ({ ...prev, entityId: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Tags (comma separated)"
            value={form.tags}
            onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
          />
        </div>
        <div className="toolbar">
          <textarea
            rows={3}
            style={{ width: '100%' }}
            placeholder="Write note..."
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
          />
        </div>
        <div className="toolbar">
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3>Search Notes</h3>
        <div className="toolbar" style={{ marginTop: '0.7rem' }}>
          <input
            type="text"
            placeholder="Entity type"
            value={filters.entityType}
            onChange={(e) => setFilters((prev) => ({ ...prev, entityType: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Entity id"
            value={filters.entityId}
            onChange={(e) => setFilters((prev) => ({ ...prev, entityId: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Tag"
            value={filters.tag}
            onChange={(e) => setFilters((prev) => ({ ...prev, tag: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Search note text"
            value={filters.q}
            onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
          />
          <button className="btn secondary" onClick={() => load(1)}>Apply</button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Updated</th>
                <th>Entity</th>
                <th>Note</th>
                <th>Tags</th>
                <th>Updated By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  <td>{formatDate(row.updatedAt)}</td>
                  <td>{row.entityType}:{row.entityId}</td>
                  <td>{row.note || '-'}</td>
                  <td>{(row.tags || []).join(', ') || '-'}</td>
                  <td>{row.updatedBy?.displayName || row.updatedBy?.username || '-'}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="5">No notes found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination meta={meta} onPageChange={load} />
      </section>
    </div>
  );
}
