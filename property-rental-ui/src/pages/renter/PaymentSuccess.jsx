import { useEffect, useState, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';

export default function PaymentSuccess() {
  const { token } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Verifying payment...');

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const pid = query.get('pid');
    const bookingId = query.get('bookingId');
    const amount = query.get('amount');

    if (!pid || !bookingId || !amount) {
      setMessage('Invalid payment details.');
      return;
    }

    const verifyPayment = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/payments/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ pid, refId: pid, amount, bookingId }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setMessage('Payment successful!');
          setTimeout(() => navigate('/renter/payments'), 2000);
        } else {
          setMessage(data.message || 'Payment verification failed.');
        }
      } catch (err) {
        setMessage('Server error while verifying payment.');
      }
    };

    verifyPayment();
  }, [location.search, navigate, token]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>{message}</h2>
      <p>Please wait...</p>
    </div>
  );
}
