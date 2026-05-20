import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { image } from '../../assets/assets';
import { API_BASE_URL } from '../../config/api';
import { useLanguage } from '../../context/LanguageContext';
import './Register.css';

export default function Register() {
  const [name, setName] = useState('');
  const [citizenshipNumber, setCitizenshipNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('owner');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  const navigate = useNavigate();
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email || !password) {
      setError(t('auth.fillAllFields'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, citizenshipNumber, email, password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
      } else {
        if (data.verificationRequired) {
          setVerificationRequired(true);
          setVerificationEmail(data.email || email);
          setSuccess(data.message || t('auth.otpSent'));
        } else {
          setSuccess(t('auth.registrationSuccess'));
          setTimeout(() => {
            navigate('/login');
          }, 2000);
        }
      }
    } catch (err) {
      setError(t('auth.serverError'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!verificationEmail || !otp) {
      setError(t('auth.enterOtpRequired'));
      return;
    }
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'OTP verification failed');
      } else {
        setSuccess(t('auth.emailVerifiedRedirect'));
        setTimeout(() => navigate('/login'), 1500);
      }
    } catch {
      setError(t('auth.serverError'));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setSuccess('');
    if (!verificationEmail) {
      setError(t('auth.missingEmail'));
      return;
    }
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/resend-email-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to resend OTP');
      } else {
        setSuccess(data.message || t('auth.otpResent'));
      }
    } catch {
      setError(t('auth.serverError'));
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-left">
        <h1>
          {t('auth.joinUs')}
        </h1>
        <img src={image.property} alt="Property" />
      </div>
      <div className="register-right">
        <h2>
          <span className="logo">Property</span> Rental
        </h2>
        <h3>{verificationRequired ? t('auth.verifyEmail') : t('auth.registerTitle')}</h3>
        {!verificationRequired ? (
        <form onSubmit={handleSubmit}>
          <label>{t('auth.fullName')}</label>
          <input
            type="text"
            placeholder={t('auth.fullName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label>{t('auth.citizenshipNumber')}</label>
          <input
            type="text"
            placeholder={t('auth.citizenshipNumber')}
            value={citizenshipNumber}
            onChange={(e) => setCitizenshipNumber(e.target.value)}
          />
          <label>{t('auth.email')}</label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label>{t('auth.password')}</label>
          <input
            type="password"
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label>{t('auth.registerAs')}</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="owner">{t('common.owner')}</option>
            <option value="renter">{t('common.renter')}</option>
          </select>

          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}

          <button type="submit" disabled={loading}>
            {loading ? t('auth.registering') : t('auth.register')}
          </button>
        </form>
        ) : (
        <form onSubmit={handleVerifyOtp}>
          <label>{t('auth.email')}</label>
          <input type="email" value={verificationEmail} readOnly />

          <label>{t('auth.otp')}</label>
          <input
            type="text"
            placeholder={t('auth.enterOtp')}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}
          <button type="submit" disabled={otpLoading}>
            {otpLoading ? t('auth.verifying') : t('auth.verifyOtp')}
          </button>
          <button type="button" disabled={otpLoading} onClick={handleResendOtp}>
            {otpLoading ? t('auth.pleaseWait') : t('auth.resendOtp')}
          </button>
        </form>
        )}
        <div className="register-footer">
          <p>
            {t('auth.alreadyAccount')} <Link to="/login">{t('auth.login')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
