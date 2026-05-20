import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './DocumentCenter.css';

export default function DocumentCenter() {
  const { token } = useContext(AuthContext);
  const [data, setData] = useState({
    summary: { agreements: 0, invoices: 0, verificationDocs: 0 },
    agreements: [],
    invoices: [],
    verificationDocs: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/api/users/documents/center`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Failed to load documents');
        setData({
          summary: payload.summary || data.summary,
          agreements: Array.isArray(payload.agreements) ? payload.agreements : [],
          invoices: Array.isArray(payload.invoices) ? payload.invoices : [],
          verificationDocs: Array.isArray(payload.verificationDocs) ? payload.verificationDocs : [],
        });
      } catch (err) {
        setError(err.message || 'Failed to load documents');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const downloadInvoice = async (paymentId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/payments/${paymentId}/invoice`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to load invoice');

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${payload.invoiceNumber || `invoice-${paymentId}`}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to download invoice');
    }
  };

  if (loading) return <p>Loading documents...</p>;

  return (
    <div className="document-center">
      <div className="document-center-head">
        <h2>Document Center</h2>
        <p>Agreements, invoices, and verification docs in one place.</p>
      </div>

      {error && <p className="doc-error">{error}</p>}

      <div className="doc-summary-grid">
        <article className="doc-summary-card">
          <strong>{data.summary.agreements}</strong>
          <span>Agreements</span>
        </article>
        <article className="doc-summary-card">
          <strong>{data.summary.invoices}</strong>
          <span>Invoices</span>
        </article>
        <article className="doc-summary-card">
          <strong>{data.summary.verificationDocs}</strong>
          <span>Verification Docs</span>
        </article>
      </div>

      <section className="doc-section">
        <h3>Agreements</h3>
        {data.agreements.length === 0 ? (
          <p className="doc-empty">No agreements yet.</p>
        ) : (
          <div className="doc-list">
            {data.agreements.map((doc) => (
              <article className="doc-row" key={doc.id}>
                <div>
                  <h4>{doc.title}</h4>
                  <p>
                    Version {doc.version} • {doc.status}
                  </p>
                </div>
                <Link className="doc-btn" to={doc.openLink || '#'}>Open</Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="doc-section">
        <h3>Invoices</h3>
        {data.invoices.length === 0 ? (
          <p className="doc-empty">No invoices yet.</p>
        ) : (
          <div className="doc-list">
            {data.invoices.map((doc) => (
              <article className="doc-row" key={doc.id}>
                <div>
                  <h4>{doc.title}</h4>
                  <p>
                    {doc.property} • Rs. {doc.amount} • {doc.status}
                  </p>
                </div>
                <button className="doc-btn" onClick={() => downloadInvoice(doc.id)}>
                  Download
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="doc-section">
        <h3>Verification Docs</h3>
        {data.verificationDocs.length === 0 ? (
          <p className="doc-empty">No verification documents yet.</p>
        ) : (
          <div className="doc-list">
            {data.verificationDocs.map((doc) => (
              <article className="doc-row" key={doc.id}>
                <div>
                  <h4>{doc.title}</h4>
                  <p>{doc.status}</p>
                </div>
                <a
                  className="doc-btn"
                  href={doc.openLink || '#'}
                  target="_blank"
                  rel="noreferrer"
                >
                  View
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
