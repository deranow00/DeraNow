import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // ✅ Added Link
import { image } from '../../assets/assets';
import { AuthContext } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('owner');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError(t('auth.enterBothEmailPassword'));
      return;
    }

    setLoading(true);
    try {
      const result = await login(email, password, role);

      if (result.error) {
        setError(result.error || t('auth.login'));
      } else {
        navigate(role === 'owner' ? '/owner' : '/renter');
      }
    } catch (err) {
      setError(t('auth.serverError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <h1>{t('auth.welcome').replace('!', '')}<span className="green">!</span></h1>
        <img src={image.property} alt="Property" />
      </div>
      <div className="login-right">
        <div className="login-box">

          <h2><span className="logo">Property</span> Rental</h2>
          <h3>{t('auth.loginTitle')}</h3>
          <form onSubmit={handleSubmit}>
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

            <label>{t('auth.loginAs')}</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="owner">{t('common.owner')}</option>
              <option value="renter">{t('common.renter')}</option>
            </select>

            {error && <p className="error">{error}</p>}

            <button type="submit" disabled={loading}>
              {loading ? t('auth.loggingIn') : t('auth.login')}
            </button>
          </form>
          <div className="login-footer">
            <Link to="/forgot-password">{t('auth.forgotPassword')}</Link>
            <p>
              {t('auth.noAccount')} <Link to="/register">{t('auth.signUp')}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
