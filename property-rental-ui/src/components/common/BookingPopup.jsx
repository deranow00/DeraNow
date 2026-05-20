import React, { useContext, useMemo, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import './BookingPopup.css';

export default function BookingPopup({ property, onClose }) {
  const { token, user } = useContext(AuthContext);
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [fromDate, setFromDate] = useState('');
  const [form, setForm] = useState({
    fullName: user?.name || '',
    phone: '',
    email: user?.email || '',
    occupants: '1',
    employmentStatus: '',
    monthlyIncome: '',
    moveInReason: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    noteToOwner: '',
  });

  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleBooking = async () => {
    setMessage('');
    setSuccess('');

    if (!token) {
      setMessage('Please log in to book a property.');
      return;
    }

    if (!fromDate) {
      setMessage('Please select move-in date.');
      return;
    }

    if (!form.fullName || !form.phone || !form.occupants) {
      setMessage('Please fill full name, phone, and occupants.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: property._id,
          fromDate,
          bookingDetails: {
            ...form,
            occupants: Number(form.occupants),
            monthlyIncome: form.monthlyIncome ? Number(form.monthlyIncome) : undefined,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to book');

      setSuccess('Booking request sent successfully!');

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMessage('');
    setSuccess('');
    setFromDate('');
    setLoading(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content booking-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} aria-label="Close popup" title="Close">
          ✕
        </button>

        <h2>Apply for Booking</h2>
        <p className="booking-subtitle">
          Complete details for <strong>{property.title}</strong>
        </p>

        <div className="booking-grid">
          <div>
            <label>Move-in Date *</label>
            <input type="date" min={today} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>

          <div>
            <label>Full Name *</label>
            <input value={form.fullName} onChange={(e) => handleChange('fullName', e.target.value)} />
          </div>
          <div>
            <label>Phone *</label>
            <input value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} />
          </div>

          <div>
            <label>Email</label>
            <input value={form.email} onChange={(e) => handleChange('email', e.target.value)} />
          </div>
          <div>
            <label>Occupants *</label>
            <input
              type="number"
              min="1"
              value={form.occupants}
              onChange={(e) => handleChange('occupants', e.target.value)}
            />
          </div>

          <div>
            <label>Employment Status</label>
            <input
              placeholder="Employed / Self-employed / Student"
              value={form.employmentStatus}
              onChange={(e) => handleChange('employmentStatus', e.target.value)}
            />
          </div>
          <div>
            <label>Monthly Income (NPR)</label>
            <input
              type="number"
              min="0"
              value={form.monthlyIncome}
              onChange={(e) => handleChange('monthlyIncome', e.target.value)}
            />
          </div>

          <div>
            <label>Emergency Contact Name</label>
            <input
              value={form.emergencyContactName}
              onChange={(e) => handleChange('emergencyContactName', e.target.value)}
            />
          </div>
          <div>
            <label>Emergency Contact Phone</label>
            <input
              value={form.emergencyContactPhone}
              onChange={(e) => handleChange('emergencyContactPhone', e.target.value)}
            />
          </div>

          <div className="span-2">
            <label>Purpose / Move-in Reason</label>
            <textarea
              rows="2"
              value={form.moveInReason}
              onChange={(e) => handleChange('moveInReason', e.target.value)}
            />
          </div>

          <div className="span-2">
            <label>Note to Owner</label>
            <textarea
              rows="3"
              value={form.noteToOwner}
              onChange={(e) => handleChange('noteToOwner', e.target.value)}
            />
          </div>
        </div>

        <button className="booking-submit-btn" onClick={handleBooking} disabled={loading}>
          {loading ? 'Processing...' : 'Submit Booking Request'}
        </button>

        {message && <p className="error">{message}</p>}
        {success && <p className="success">{success}</p>}
      </div>
    </div>
  );
}
