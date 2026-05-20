import { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './Agreements.css';

const statusLabel = (status) => {
  if (status === 'fully_signed') return 'Fully Signed';
  if (status === 'pending_renter') return 'Pending Renter';
  return 'Pending Owner';
};

export default function Agreements() {
  const { token, user } = useContext(AuthContext);
  const [agreements, setAgreements] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [signature, setSignature] = useState('');
  const [customContent, setCustomContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const canGenerate = user?.role === 'owner';

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setMessage('');
    try {
      const agreementsRes = await fetch(`${API_BASE_URL}/api/agreements/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const agreementsData = await agreementsRes.json();
      if (!agreementsRes.ok) throw new Error(agreementsData.error || 'Failed to load agreements');
      setAgreements(Array.isArray(agreementsData) ? agreementsData : []);

      if (canGenerate) {
        const ownerBookingsRes = await fetch(`${API_BASE_URL}/api/bookings/owner`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const ownerBookingsData = await ownerBookingsRes.json();
        if (ownerBookingsRes.ok) {
          setBookings(
            (Array.isArray(ownerBookingsData) ? ownerBookingsData : []).filter(
              (b) => b.status === 'Approved'
            )
          );
        }
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const agreementBookingIds = useMemo(
    () => new Set(agreements.map((a) => String(a.booking))),
    [agreements]
  );

  const generateAgreement = async (bookingId) => {
    const res = await fetch(`${API_BASE_URL}/api/agreements/generate/${bookingId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: customContent }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || 'Failed to generate agreement');
      return;
    }
    setCustomContent('');
    setMessage('Agreement generated successfully.');
    load();
  };

  const openAgreement = async (id) => {
    const res = await fetch(`${API_BASE_URL}/api/agreements/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || 'Failed to load agreement');
      return;
    }
    setSelectedAgreement(data);
  };

  const signAgreement = async () => {
    if (!selectedAgreement?._id || !signature.trim()) return;
    const res = await fetch(`${API_BASE_URL}/api/agreements/${selectedAgreement._id}/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ signature: signature.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || 'Failed to sign agreement');
      return;
    }
    setSignature('');
    setSelectedAgreement(data);
    setMessage('Agreement signed successfully.');
    load();
  };

  if (loading) return <p>Loading agreements...</p>;

  return (
    <div className="agreements-page">
      <div className="agreements-head">
        <h2>Lease Agreements</h2>
        <p>Generate, sign, and track agreement versions.</p>
      </div>

      {message && <p className="agreements-message">{message}</p>}

      {canGenerate && (
        <div className="agreements-generator">
          <h3>Generate Agreement</h3>
          <p>Select an approved booking to generate or regenerate agreement.</p>
          <textarea
            value={customContent}
            onChange={(e) => setCustomContent(e.target.value)}
            placeholder="Optional custom template content (leave empty for default template)"
          />
          <div className="agreements-booking-list">
            {bookings.map((booking) => {
              const hasAgreement = agreementBookingIds.has(String(booking._id));
              return (
                <button
                  key={booking._id}
                  onClick={() => generateAgreement(booking._id)}
                  className={hasAgreement ? 'secondary' : ''}
                >
                  {hasAgreement ? 'Regenerate' : 'Generate'}: {booking.property?.title} ({booking.renter?.email})
                </button>
              );
            })}
            {bookings.length === 0 && <p>No approved bookings available.</p>}
          </div>
        </div>
      )}

      <div className="agreements-list">
        <h3>Agreement History</h3>
        {agreements.length === 0 ? (
          <p>No agreements yet.</p>
        ) : (
          agreements.map((agreement) => (
            <div className="agreement-row" key={agreement._id}>
              <div>
                <strong>{agreement.property?.title || 'Property'}</strong>
                <p>
                  Version {agreement.currentVersion} • {statusLabel(agreement.activeVersion?.status)}
                </p>
                <small>Updated: {new Date(agreement.updatedAt).toLocaleString()}</small>
              </div>
              <button onClick={() => openAgreement(agreement._id)}>View</button>
            </div>
          ))
        )}
      </div>

      {selectedAgreement && (
        <div className="agreements-modal" onClick={() => setSelectedAgreement(null)}>
          <div className="agreements-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="agreements-close" onClick={() => setSelectedAgreement(null)}>
              Close
            </button>
            <h3>{selectedAgreement.property?.title || 'Agreement'}</h3>
            <p>
              Active Version: {selectedAgreement.currentVersion} •{' '}
              {statusLabel(selectedAgreement.activeVersion?.status)}
            </p>
            <pre className="agreements-content">
              {selectedAgreement.activeVersion?.content || 'No content'}
            </pre>
            <div className="agreements-signatures">
              <p>Owner Signature: {selectedAgreement.activeVersion?.ownerSignature || 'Not signed'}</p>
              <p>Renter Signature: {selectedAgreement.activeVersion?.renterSignature || 'Not signed'}</p>
            </div>
            <div className="agreements-sign-box">
              <input
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="Type your full name as signature"
              />
              <button onClick={signAgreement}>Sign Current Version</button>
            </div>
            <div className="agreements-versions">
              <h4>Version History</h4>
              <ul>
                {(selectedAgreement.versions || [])
                  .slice()
                  .sort((a, b) => b.version - a.version)
                  .map((v) => (
                    <li key={v.version}>
                      v{v.version} - {statusLabel(v.status)} ({new Date(v.createdAt).toLocaleString()})
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
