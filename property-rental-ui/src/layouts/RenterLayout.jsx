import React, { useContext, useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
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
} from 'react-icons/hi2';
import NotificationList from '../components/NotificationList.jsx';
import MobileBottomNav from '../components/common/MobileBottomNav.jsx';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './RenterLayout.css';

const renterNavItems = [
  { to: '/renter', labelKey: 'nav.home', icon: <HiOutlineHome />, end: true },
  { to: '/renter/bookings', labelKey: 'nav.bookings', icon: <HiOutlineCalendarDays /> },
  { to: '/renter/listings', labelKey: 'nav.listings', icon: <HiOutlineSquares2X2 /> },
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
  { to: '/renter/bookings', labelKey: 'nav.bookings', icon: <HiOutlineCalendarDays /> },
  { to: '/renter/message', labelKey: 'nav.messages', icon: <HiOutlineChatBubbleOvalLeftEllipsis /> },
];

const renterSecondaryItems = [
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

  return matched ? t(matched.labelKey) : t('common.workspace');
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
          <h2 className="logo">Dera</h2>
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
              <span className="nav-label">{t(item.labelKey)}</span>
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
          <div className="topbar-copy desktop-copy">
            <span className="topbar-eyebrow">{t('layout.renterApp')}</span>
            <h3>{t('layout.welcome', { name: user?.name || t('common.renter') })}</h3>
          </div>
          <div className="topbar-copy mobile-copy">
            <span className="topbar-eyebrow">{t('common.appName')}</span>
            <h3>{mobileTitle}</h3>
            <p>{user?.name || t('common.renter')}</p>
          </div>
          <div className="user-menu">
            <div className="topbar-avatar">
              <span>{(user?.name || 'R').trim().charAt(0).toUpperCase()}</span>
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
