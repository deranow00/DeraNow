import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import API, { clearAdminSession } from '../api';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/users', label: 'Users' },
  { to: '/owner-requests', label: 'Owner Requests' },
  { to: '/kyc-requests', label: 'KYC Requests' },
  { to: '/properties', label: 'Properties' },
  { to: '/bookings', label: 'Bookings' },
  { to: '/payments', label: 'Payments' },
  { to: '/complaints', label: 'Complaints' },
  { to: '/messages', label: 'Messages' },
  { to: '/reviews', label: 'Reviews' },
  { to: '/content', label: 'Content' },
  { to: '/settings', label: 'Settings' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/reports', label: 'Reports' },
  { to: '/revenue-command', label: 'Revenue Command' },
  { to: '/ops-center', label: 'Ops Center' },
  { to: '/rule-engine', label: 'Rule Engine' },
  { to: '/export-center', label: 'Export Center' },
  { to: '/admin-notes', label: 'Admin Notes' },
  { to: '/duplicate-hub', label: 'Duplicate Hub' },
  { to: '/access-control', label: 'Access Control' },
  { to: '/audit-logs', label: 'Audit Logs' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('adminTheme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });
  const [incident, setIncident] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('adminTheme', theme);
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    const loadIncident = async () => {
      try {
        const res = await API.get('/ops/incidents');
        if (!mounted) return;
        const list = Array.isArray(res.data?.incidents) ? res.data.incidents : [];
        setIncident(list[0] || null);
      } catch {
        if (mounted) setIncident(null);
      }
    };
    loadIncident();
    const timer = setInterval(loadIncident, 60_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const logout = () => {
    clearAdminSession();
    navigate('/login');
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">Property Admin</div>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button className="logout-btn" onClick={logout}>Logout</button>
      </aside>

      <main className="admin-main">
        {incident ? (
          <div className={`incident-banner ${incident.severity || 'medium'}`}>
            <strong>{incident.title || 'Incident'}</strong>
            <span>{incident.message || incident.detail}</span>
          </div>
        ) : null}
        <div className="admin-main-topbar">
          <button
            className={`theme-toggle ${theme}`}
            type="button"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            aria-label="Toggle dark mode"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span className="theme-toggle-track">
              <span className="theme-toggle-thumb" />
            </span>
            <span className="theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
