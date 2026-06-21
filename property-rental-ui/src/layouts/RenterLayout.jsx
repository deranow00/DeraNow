import React, { useContext, useMemo, useState } from 'react';
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  HiOutlineCalendarDays,
  HiOutlineChatBubbleOvalLeftEllipsis,
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight,
  HiOutlineCog6Tooth,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlineFolderOpen,
  HiOutlineHeart,
  HiOutlineHome,
  HiOutlineSquares2X2,
  HiOutlineUserCircle,
  HiOutlineCreditCard,
  HiOutlineMapPin,
} from 'react-icons/hi2';
import NotificationList from '../components/NotificationList.jsx';
import MobileBottomNav from '../components/common/MobileBottomNav.jsx';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './RenterLayout.css';

const renterNavItems = [
  { to: '/renter', labelKey: 'nav.home', icon: <HiOutlineHome />, end: true },
  { to: '/renter/bookings', labelKey: 'nav.bookings', icon: <HiOutlineCalendarDays /> },
  { to: '/renter/booking-requests', label: 'Requests', icon: <HiOutlineCalendarDays /> },
  { to: '/renter/listings', labelKey: 'nav.listings', icon: <HiOutlineSquares2X2 /> },
  { to: '/renter/visits', labelKey: 'nav.visits', icon: <HiOutlineMapPin /> },
  { to: '/renter/favorites', labelKey: 'nav.favorites', icon: <HiOutlineHeart /> },
  { to: '/renter/message', labelKey: 'nav.messages', icon: <HiOutlineChatBubbleOvalLeftEllipsis /> },
  { to: '/renter/agreements', labelKey: 'nav.agreements', icon: <HiOutlineDocumentText /> },
  { to: '/renter/documents', labelKey: 'nav.documents', icon: <HiOutlineFolderOpen /> },
  { to: '/renter/complaint', labelKey: 'nav.complaints', icon: <HiOutlineExclamationTriangle /> },
  { to: '/renter/payments', labelKey: 'nav.payments', icon: <HiOutlineCreditCard /> },
  { to: '/renter/profile', labelKey: 'nav.profile', icon: <HiOutlineUserCircle /> },
  { to: '/renter/settings', labelKey: 'nav.settings', icon: <HiOutlineCog6Tooth /> },
];

const renterPrimaryItems = [
  { to: '/renter', labelKey: 'nav.home', icon: <HiOutlineHome />, end: true },
  { to: '/renter/listings', labelKey: 'nav.browse', icon: <HiOutlineSquares2X2 /> },
  { to: '/renter/visits', labelKey: 'nav.visits', icon: <HiOutlineMapPin /> },
  { to: '/renter/bookings', labelKey: 'nav.bookings', icon: <HiOutlineCalendarDays /> },
];

const renterSecondaryItems = [
  { to: '/renter/booking-requests', label: 'Requests', icon: <HiOutlineCalendarDays /> },
  { to: '/renter/message', labelKey: 'nav.messages', icon: <HiOutlineChatBubbleOvalLeftEllipsis /> },
  { to: '/renter/favorites', labelKey: 'nav.favorites', icon: <HiOutlineHeart /> },
  { to: '/renter/payments', labelKey: 'nav.payments', icon: <HiOutlineCreditCard /> },
  { to: '/renter/agreements', labelKey: 'nav.agreements', icon: <HiOutlineDocumentText /> },
  { to: '/renter/documents', labelKey: 'nav.documents', icon: <HiOutlineFolderOpen /> },
  { to: '/renter/complaint', labelKey: 'nav.complaints', icon: <HiOutlineExclamationTriangle /> },
  { to: '/renter/profile', labelKey: 'nav.profile', icon: <HiOutlineUserCircle /> },
  { to: '/renter/settings', labelKey: 'nav.settings', icon: <HiOutlineCog6Tooth /> },
];

function resolveRenterTitle(pathname, t) {
  const matched = [...renterNavItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));

  return matched ? (matched.labelKey ? t(matched.labelKey) : matched.label) : t('common.workspace');
}

export default function RenterLayout() {
  const { user, logout } = useContext(AuthContext);
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const mobileTitle = useMemo(
    () => resolveRenterTitle(location.pathname, t),
    [location.pathname, t],
  );

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`renter-layout ios-app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <h2 className="logo">{t('common.appName')}</h2>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')}
            title={collapsed ? t('layout.expandSidebar') : t('layout.collapseSidebar')}
          >
            {collapsed ? <HiOutlineChevronDoubleRight /> : <HiOutlineChevronDoubleLeft />}
          </button>
        </div>
        <div className="sidebar-subtitle">{t('layout.renterWorkspace')}</div>
        <nav>
          {renterNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="nav-short">{item.icon}</span>
              <span className="nav-label">{item.labelKey ? t(item.labelKey) : item.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className="sidebar-logout"
            onClick={handleLogout}
          >
            <span className="nav-short">↗</span>
            <span className="nav-label">{t('common.logout')}</span>
          </button>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="desktop-nav-shell">
            <div className="desktop-nav-bar">
              <Link className="desktop-brand" to="/renter">
                <span className="desktop-brand-mark">D</span>
                <span className="desktop-brand-copy">
                  <strong>{t('common.appName')}</strong>
                  <small>{t('layout.renterWorkspace')}</small>
                </span>
              </Link>

              <nav className="desktop-primary-nav" aria-label="Primary renter navigation">
                {renterPrimaryItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `desktop-nav-link${isActive ? ' active' : ''}`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.labelKey ? t(item.labelKey) : item.label}</span>
                  </NavLink>
                ))}
              </nav>

              <div className="desktop-nav-tools">
                <div className="desktop-welcome-chip">
                  <span className="desktop-welcome-label">{t('layout.renterApp')}</span>
                  <strong>{user?.name || t('common.renter')}</strong>
                </div>
                <div className={`topbar-avatar ${user?.profileImage?.imageUrl ? 'has-image' : ''}`}>
                  {user?.profileImage?.imageUrl ? (
                    <img src={user.profileImage.imageUrl} alt="" />
                  ) : (
                    <span>{(user?.name || 'R').trim().charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <NotificationList />
                <button type="button" className="desktop-logout-btn" onClick={handleLogout}>
                  {t('common.logout')}
                </button>
              </div>
            </div>

            <nav className="desktop-secondary-nav" aria-label="Secondary renter navigation">
              {renterSecondaryItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `desktop-subnav-link${isActive ? ' active' : ''}`}
                >
                  <span>{item.icon}</span>
                  <span>{item.labelKey ? t(item.labelKey) : item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="topbar-copy mobile-copy">
            <span className="topbar-eyebrow">{t('common.appName')}</span>
            <h3>{mobileTitle}</h3>
            <p>{user?.name || t('common.renter')}</p>
          </div>
          <div className="user-menu mobile-user-menu">
            <div className={`topbar-avatar ${user?.profileImage?.imageUrl ? 'has-image' : ''}`}>
              {user?.profileImage?.imageUrl ? (
                <img src={user.profileImage.imageUrl} alt="" />
              ) : (
                <span>{(user?.name || 'R').trim().charAt(0).toUpperCase()}</span>
              )}
            </div>
            <NotificationList />
          </div>
        </header>

        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>

      <MobileBottomNav
        primaryItems={renterPrimaryItems}
        secondaryItems={renterSecondaryItems}
        logoutPath="/login"
      />
    </div>
  );
}
