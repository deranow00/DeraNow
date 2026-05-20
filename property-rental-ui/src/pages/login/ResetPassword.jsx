import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config/api';
import { useLanguage } from '../../context/LanguageContext';
import './ForgotPassword.css';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { t } = useLanguage();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError(t('auth.missingResetToken'));
      return;
    }
    if (!password || password.length < 6) {
      setError(t('auth.passwordMinLength'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordsDontMatch'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');
      setSuccess(data.message || t('auth.resetSuccess'));
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-container">
      <div className="forgot-card">
        <h2>{t('auth.resetPasswordTitle')}</h2>
        <p className="forgot-subtitle">{t('auth.resetPasswordSubtitle')}</p>

        <form onSubmit={onSubmit}>
          <label>{t('auth.newPassword')}</label>
          <input
            type="password"
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label>{t('auth.confirmPassword')}</label>
          <input
            type="password"
            placeholder="********"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          {error && <p className="forgot-error">{error}</p>}
          {success && <p className="forgot-success">{success}</p>}

          <button type="submit" disabled={loading}>
            {loading ? t('auth.updating') : t('auth.updatePassword')}
          </button>
        </form>

        <div className="forgot-footer">
          <Link to="/login">{t('auth.backToLogin')}</Link>
        </div>
      </div>
    </div>
  );
}
