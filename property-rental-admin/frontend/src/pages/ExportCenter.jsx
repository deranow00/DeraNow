import { useState } from 'react';
import API from '../api';

const DATASETS = ['payments', 'bookings', 'users', 'audit-logs'];

export default function ExportCenter() {
  const [dataset, setDataset] = useState('payments');
  const [preview, setPreview] = useState({ headers: [], count: 0, preview: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadPreview = async () => {
    try {
      setError('');
      setLoading(true);
      const res = await API.get(`/exports/${dataset}`, { params: { limit: 500 } });
      setPreview(res.data || { headers: [], count: 0, preview: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load export preview');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = async () => {
    const res = await API.get(`/exports/${dataset}`, {
      params: { export: 'csv', limit: 5000 },
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${dataset}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header"><div><h1>Export Center</h1><p className="page-subtitle">Run dataset exports with preview and CSV download.</p></div></div>
      <div className="toolbar">
        <select value={dataset} onChange={(e) => setDataset(e.target.value)}>
          {DATASETS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button className="btn" onClick={loadPreview} disabled={loading}>{loading ? 'Loading...' : 'Load Preview'}</button>
        <button className="btn secondary" onClick={downloadCsv}>Download CSV</button>
      </div>
      {error && <p className="error">{error}</p>}
      <section className="card">
        <h3>Preview ({preview.count || 0} rows)</h3>
        <div className="table-wrap" style={{ marginTop: '0.7rem' }}>
          <table className="table">
            <thead>
              <tr>{(preview.headers || []).map((header) => <th key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {(preview.preview || []).map((row, idx) => (
                <tr key={idx}>
                  {(preview.headers || []).map((header) => (
                    <td key={`${idx}-${header}`}>{typeof row?.[header] === 'object' ? JSON.stringify(row?.[header]) : String(row?.[header] ?? '')}</td>
                  ))}
                </tr>
              ))}
              {(preview.preview || []).length === 0 && <tr><td colSpan={Math.max(1, (preview.headers || []).length)}>No preview loaded.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
