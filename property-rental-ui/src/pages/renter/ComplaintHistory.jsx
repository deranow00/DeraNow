import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './ComplaintPage.css';

export default function ComplaintHistory() {
  const { user, token } = useContext(AuthContext);
  const renterEmail = user?.email?.trim().toLowerCase() || '';

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchComplaints = async () => {
    if (!renterEmail) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/complaints/${renterEmail}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setComplaints(data);
    } catch (err) {
      console.error('Error fetching complaints:', err);
    } finally {
      setLoading(false);
    }
  };

  const markResolved = async (id) => {
    try {
      await fetch(`${API_BASE_URL}/api/complaints/${id}/resolve`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      fetchComplaints();
    } catch (err) {
      console.error('Error resolving complaint:', err);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, [renterEmail]);

  if (loading) return <p>Loading complaints...</p>;
  if (!renterEmail) return <p>No user found.</p>;

  return (
    <div className="complaint-container">
      <h1>Your Complaint History</h1>
      {complaints.length === 0 ? (
        <p>No complaints found.</p>
      ) : (
        <ul className="complaint-list">
          {complaints.map((c) => (
            <li key={c._id} className={`complaint-item ${c.status}`}>
              <h3>{c.subject}</h3>
              <p>{c.complaint}</p>
              <p>
                <strong>Status:</strong> {c.status}
              </p>
              <p>
                <small>{new Date(c.createdAt).toLocaleString()}</small>
              </p>
              {c.status === 'pending' && (
                <button className="btn-resolve" onClick={() => markResolved(c._id)}>
                  Mark Resolved
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
