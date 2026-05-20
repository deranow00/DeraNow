import { useEffect, useState } from 'react';
import API from '../api';

function renderRows(rows, valueKey = 'count') {
  return (rows || []).map((row) => (
    <tr key={row._id || 'unknown'}>
      <td>{row._id || 'Unknown'}</td>
      <td>{row[valueKey] ?? 0}</td>
      {valueKey !== 'count' && <td>{row.count ?? 0}</td>}
    </tr>
  ));
}

export default function Reports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await API.get('/reports');
        setData(res.data);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load reports');
      }
    };
    load();
  }, []);

  return (
    <div>
      <div className="page-header"><div><h1>Reports</h1><p className="page-subtitle">Operational and financial breakdowns by status.</p></div></div>
      {error ? <p className="error">{error}</p> : null}

      <div className="kpi-grid">
        <div className="card">
          <h3>Properties</h3>
          <div className="table-wrap"><table className="table"><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>{renderRows(data?.propertyByStatus)}{!(data?.propertyByStatus || []).length && <tr><td colSpan="2">No data</td></tr>}</tbody></table></div>
        </div>
        <div className="card">
          <h3>Bookings</h3>
          <div className="table-wrap"><table className="table"><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>{renderRows(data?.bookingByStatus)}{!(data?.bookingByStatus || []).length && <tr><td colSpan="2">No data</td></tr>}</tbody></table></div>
        </div>
        <div className="card">
          <h3>Payments</h3>
          <div className="table-wrap"><table className="table"><thead><tr><th>Status</th><th>Total Amount</th><th>Count</th></tr></thead><tbody>{renderRows(data?.paymentByStatus, 'total')}{!(data?.paymentByStatus || []).length && <tr><td colSpan="3">No data</td></tr>}</tbody></table></div>
        </div>
        <div className="card">
          <h3>Complaints</h3>
          <div className="table-wrap"><table className="table"><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>{renderRows(data?.complaintByStatus)}{!(data?.complaintByStatus || []).length && <tr><td colSpan="2">No data</td></tr>}</tbody></table></div>
        </div>
      </div>
    </div>
  );
}
