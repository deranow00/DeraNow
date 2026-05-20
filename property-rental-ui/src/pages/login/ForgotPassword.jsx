import { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../config/api';
import { useLanguage } from '../../context/LanguageContext';
import './ForgotPassword.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const { t } = useLanguage();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setResetUrl('');

    if (!email) {
      setError(t('auth.emailRequired'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request');
      setSuccess(data.message || t('auth.resetEmailSent'));
      if (data.resetUrl) setResetUrl(data.resetUrl);
    } catch (err) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-container">
      <div className="forgot-card">
        <h2>{t('auth.forgotPasswordTitle')}</h2>
        <p className="forgot-subtitle">{t('auth.forgotPasswordSubtitle')}</p>

        <form onSubmit={onSubmit}>
          <label>{t('auth.email')}</label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {error && <p className="forgot-error">{error}</p>}
          {success && <p className="forgot-success">{success}</p>}
          {resetUrl && (
            <p className="forgot-dev-link">
              {t('auth.devResetLink')}: <a href={resetUrl}>{resetUrl}</a>
            </p>
          )}

          <button type="submit" disabled={loading}>
            {loading ? t('auth.sending') : t('auth.sendResetLink')}
          </button>
        </form>

        <div className="forgot-footer">
          <Link to="/login">{t('auth.backToLogin')}</Link>
        </div>
      </div>
    </div>
  );
}
