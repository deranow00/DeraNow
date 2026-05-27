import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './Visits.css';

export default function Visits() {
  const { token } = useContext(AuthContext);
  const [passInfo, setPassInfo] = useState(null);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    const loadVisits = async () => {
      setLoading(true);
      setError('');
      try {
        const [passRes, visitsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/visits/pass/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE_URL}/api/visits/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const passPayload = await passRes.json();
        const visitsPayload = await visitsRes.json();
        if (!passRes.ok) throw new Error(passPayload.error || 'Failed to load visit pass');
        if (!visitsRes.ok) throw new Error(visitsPayload.error || 'Failed to load visits');
        setPassInfo(passPayload);
        setVisits(Array.isArray(visitsPayload) ? visitsPayload : []);
      } catch (err) {
        setError(err.message || 'Failed to load visits');
      } finally {
        setLoading(false);
      }
    };

    loadVisits();
  }, [token]);

  const latestPass = passInfo?.latestPass;
  const activePass = passInfo?.activePass;

  if (loading) return <p>Loading visits...</p>;

  return (
    <div className="renter-visits-page">
      <section className="visits-hero">
        <h1>Property Visits</h1>
        <p>Use your DeraNow visit promo to schedule property visits before applying for rent.</p>
      </section>

      {error && <p className="visits-alert error">{error}</p>}

      <section className="visit-pass-summary">
        <div>
          <span>Visit pass</span>
          <h2>{activePass ? 'Active' : latestPass?.status === 'pending_payment' ? 'Pending approval' : 'Not active'}</h2>
          <p>
            {activePass
              ? 'You can book unlimited property visits.'
              : latestPass?.status === 'pending_payment'
                ? 'Admin is verifying your QR payment.'
                : 'Open any property and book a visit to submit your first pass payment.'}
          </p>
        </div>
        <strong>{activePass?.promoCode || latestPass?.status || `Rs. ${passInfo?.amount || 100}`}</strong>
      </section>

      <section className="visits-list">
        <div className="visits-list-head">
          <h2>Scheduled visits</h2>
          <span>{visits.length}</span>
        </div>

        {visits.length === 0 ? (
          <p className="visits-empty">No visits booked yet.</p>
        ) : (
          visits.map((visit) => (
            <article className="visit-card" key={visit._id}>
              <img src={visit.property?.image || '/default-property.jpg'} alt={visit.property?.title || 'Property'} />
              <div>
                <h3>{visit.property?.title || 'Property'}</h3>
                <p>{visit.property?.location || 'Location not provided'}</p>
                <div className="visit-card-meta">
                  <span>{new Date(visit.visitDate).toLocaleDateString()}</span>
                  <span>{visit.status}</span>
                  <span>{visit.promoCode}</span>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
