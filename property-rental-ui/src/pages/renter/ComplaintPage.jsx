import React, { useState, useEffect, useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './ComplaintPage.css';

export default function ComplaintPage() {
  const { user, token } = useContext(AuthContext);
  const renterEmail = user?.email || '';

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: renterEmail,
    propertyId: '',
    subject: '',
    complaint: '',
  });

  const [properties, setProperties] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        if (!user || !token) return;

        const res = await fetch(`${API_BASE_URL}/api/bookings/approved/${user._id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        const propertyList = data.map((b) => ({
          _id: b.property._id,
          title: b.property.title,
          ownerId: b.property.ownerId._id || b.property.ownerId,
        }));

        setProperties(propertyList);
      } catch (err) {
        console.error('Error fetching properties:', err);
      }
    };

    if (user) fetchProperties();
  }, [user, token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitted(false);

    const selectedProperty = properties.find((p) => p._id === formData.propertyId);
    const complaintPayload = {
      ...formData,
      ownerId: selectedProperty?.ownerId,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/complaints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(complaintPayload),
      });

      const data = await res.json();

      if (res.ok) {
        setSubmitted(true);
        setFormData({
          name: user?.name || '',
          email: renterEmail,
          propertyId: '',
          subject: '',
          complaint: '',
        });
      } else {
        setError(data.message || 'Something went wrong');
      }
    } catch (err) {
      setError('Server not reachable. Please try again later.');
    }
  };

  return (
    <div className="complaint-container">
      <h1>Submit a Complaint</h1>

      {submitted && (
        <p className="success-msg">✅ Your complaint has been submitted successfully!</p>
      )}
      {error && <p className="error-msg">❌ {error}</p>}

      <form className="complaint-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Full Name</label>
          <input type="text" name="name" value={formData.name} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>Email Address</label>
          <input type="email" name="email" value={formData.email} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>Select Property</label>
          <select name="propertyId" value={formData.propertyId} onChange={handleChange} required>
            <option value="">-- Select Property --</option>
            {properties.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Subject</label>
          <input type="text" name="subject" value={formData.subject} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>Complaint</label>
          <textarea name="complaint" value={formData.complaint} onChange={handleChange} required />
        </div>

        <div className="form-buttons">
          <button type="submit" className="btn-submit">
            Submit Complaint
          </button>
          <button
            type="reset"
            className="btn-reset"
            onClick={() =>
              setFormData({
                name: user?.name || '',
                email: renterEmail,
                propertyId: '',
                subject: '',
                complaint: '',
              })
            }
          >
            Reset
          </button>
        </div>
      </form>

      <div className="history-btn-container">
        <NavLink to="/renter/complaint-history" state={{ email: renterEmail }} className="btn-history">
          View Complaint History
        </NavLink>
      </div>
    </div>
  );
}
