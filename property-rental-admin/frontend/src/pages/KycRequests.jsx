import { useEffect, useMemo, useState } from 'react';
import API from '../api';
import './KycRequests.css';

export default function KycRequests() {
  const [rows, setRows] = useState([]);
  const [reasonMap, setReasonMap] = useState({});
  const [message, setMessage] = useState('');
  const [processingKey, setProcessingKey] = useState('');

  const load = async () => {
    const res = await API.get('/kyc-requests');
    setRows(Array.isArray(res.data) ? res.data : []);
  };

  useEffect(() => {
    load();
  }, []);

  const requests = useMemo(() => {
    const grouped = rows.reduce((acc, row) => {
      const key = String(row.userId);
      if (!acc[key]) {
        acc[key] = {
          userId: row.userId,
          userName: row.userName,
          userEmail: row.userEmail,
          userRole: row.userRole,
          kycStatus: row.kycStatus || 'pending',
          kycRejectReason: row.kycRejectReason || '',
          uploadedAt: row.uploadedAt,
          docs: [],
        };
      }
      acc[key].docs.push(row);
      return acc;
    }, {});
    return Object.values(grouped);
  }, [rows]);

  const reviewRequest = async (requestRow, status) => {
    const userId = requestRow.userId;
    const key = String(userId);
    setProcessingKey(key);
    setMessage('');

    try {
      await API.patch(`/kyc-requests/${userId}`, {
        status,
        rejectReason: reasonMap[key] || '',
      });
    } catch (err) {
      if (err?.response?.status === 404 && Array.isArray(requestRow.docs) && requestRow.docs.length) {
        const pendingDocs = requestRow.docs.filter((doc) => (doc.docStatus || 'pending') === 'pending');
        if (!pendingDocs.length) {
          setMessage('No pending documents left for this request.');
          setProcessingKey('');
          return;
        }
        await Promise.all(
          pendingDocs.map((doc) =>
            API.patch(`/kyc-requests/${userId}/documents/${doc.documentId}`, {
              status,
              rejectReason: reasonMap[key] || '',
            })
          )
        );
      } else {
        setMessage(err?.response?.data?.error || 'Failed to review KYC request');
        setProcessingKey('');
        return;
      }
    }

    setMessage(`KYC request ${status}.`);
    await load();
    setProcessingKey('');
  };

  return (
    <div className="admin-kyc-page">
      <div className="page-header">
        <div>
          <h1>KYC Requests</h1>
          <p className="page-subtitle">One request per user. Review all submitted docs together.</p>
        </div>
      </div>

      {message && <p className="admin-kyc-message">{message}</p>}

      <div className="table-wrap admin-kyc-table-wrap">
        <table className="table admin-kyc-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Documents</th>
              <th>Uploaded</th>
              <th>Reject Reason</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((row) => {
              const key = String(row.userId);
              const hasPendingDoc = row.docs.some((d) => (d.docStatus || 'pending') === 'pending');

              return (
                <tr key={key}>
                  <td className="admin-kyc-user-cell">
                    <div className="admin-kyc-user-name">{row.userName || '-'}</div>
                    <div className="admin-kyc-user-email">{row.userEmail || '-'}</div>
                  </td>
                  <td>{row.userRole || '-'}</td>
                  <td>
                    <span className={`badge ${String(row.kycStatus).toLowerCase()}`}>{row.kycStatus}</span>
                    {row.kycRejectReason ? (
                      <div className="admin-kyc-reject-text">{row.kycRejectReason}</div>
                    ) : null}
                  </td>
                  <td>
                    <div className="admin-kyc-doc-grid">
                      {row.docs.map((doc) => (
                        <a
                          key={doc.documentId}
                          href={doc.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={doc.docType || 'KYC Document'}
                          className="admin-kyc-doc-card"
                        >
                          <img
                            src={doc.imageUrl}
                            alt={`${row.userName || 'User'} KYC`}
                            className="admin-kyc-doc-thumb"
                          />
                          <div className="admin-kyc-doc-type">{doc.docType}</div>
                          <div>
                            <span className={`badge ${String(doc.docStatus || 'pending').toLowerCase()}`}>
                              {doc.docStatus || 'pending'}
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </td>
                  <td>{row.uploadedAt ? new Date(row.uploadedAt).toLocaleString() : '-'}</td>
                  <td>
                    <textarea
                      className="admin-kyc-reason-input"
                      value={reasonMap[key] || ''}
                      onChange={(e) => setReasonMap((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder="Reason if rejecting"
                      rows={3}
                    />
                  </td>
                  <td>
                    <div className="admin-kyc-actions">
                      <button
                        className="btn"
                        disabled={processingKey === key || !hasPendingDoc}
                        onClick={() => reviewRequest(row, 'verified')}
                      >
                        {processingKey === key ? 'Working...' : 'Approve'}
                      </button>
                      <button
                        className="btn danger"
                        disabled={processingKey === key || !hasPendingDoc}
                        onClick={() => reviewRequest(row, 'rejected')}
                      >
                        {processingKey === key ? 'Working...' : 'Reject'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan="7" className="admin-kyc-empty-cell">No KYC requests yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
