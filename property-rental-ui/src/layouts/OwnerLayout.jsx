import React, { useContext, useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  HiOutlineBanknotes,
  HiOutlineBuildingOffice2,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleOvalLeftEllipsis,
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight,
  HiOutlineCog6Tooth,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlineFolderOpen,
  HiOutlinePlusCircle,
  HiOutlineSquares2X2,
  HiOutlineUserCircle,
} from 'react-icons/hi2';
import './OwnerLayout.css';
import { AuthContext } from '../context/AuthContext';
import NotificationList from '../components/NotificationList.jsx';
import MobileBottomNav from '../components/common/MobileBottomNav.jsx';
import { useLanguage } from '../context/LanguageContext';

const ownerNavItems = [
  { to: '/owner', labelKey: 'nav.dashboard', icon: <HiOutlineSquares2X2 />, end: true },
  { to: '/owner/properties', labelKey: 'nav.properties', icon: <HiOutlineBuildingOffice2 /> },
  { to: '/owner/add', labelKey: 'nav.addProperty', icon: <HiOutlinePlusCircle /> },
  { to: '/owner/requests', labelKey: 'nav.bookings', icon: <HiOutlineCalendarDays /> },
  { to: '/owner/messages', labelKey: 'nav.messages', icon: <HiOutlineChatBubbleOvalLeftEllipsis /> },
  { to: '/owner/agreements', labelKey: 'nav.agreements', icon: <HiOutlineDocumentText /> },
  { to: '/owner/documents', labelKey: 'nav.documents', icon: <HiOutlineFolderOpen /> },
  { to: '/owner/ocomplaint', labelKey: 'nav.complaints', icon: <HiOutlineExclamationTriangle /> },
  { to: '/owner/payment-status', labelKey: 'nav.rentStatus', icon: <HiOutlineBanknotes /> },
  { to: '/owner/profile', labelKey: 'nav.profile', icon: <HiOutlineUserCircle /> },
  { to: '/owner/settings', labelKey: 'nav.settings', icon: <HiOutlineCog6Tooth /> },
];

const ownerPrimaryItems = [
  { to: '/owner', labelKey: 'nav.home', icon: <HiOutlineSquares2X2 />, end: true },
  { to: '/owner/properties', labelKey: 'nav.properties', icon: <HiOutlineBuildingOffice2 /> },
  { to: '/owner/requests', labelKey: 'nav.bookings', icon: <HiOutlineCalendarDays /> },
  { to: '/owner/messages', labelKey: 'nav.messages', icon: <HiOutlineChatBubbleOvalLeftEllipsis /> },
];

const ownerSecondaryItems = [
  { to: '/owner/add', labelKey: 'nav.addProperty', icon: <HiOutlinePlusCircle /> },
  { to: '/owner/payment-status', labelKey: 'nav.rentStatus', icon: <HiOutlineBanknotes /> },
  { to: '/owner/agreements', labelKey: 'nav.agreements', icon: <HiOutlineDocumentText /> },
  { to: '/owner/documents', labelKey: 'nav.documents', icon: <HiOutlineFolderOpen /> },
  { to: '/owner/ocomplaint', labelKey: 'nav.complaints', icon: <HiOutlineExclamationTriangle /> },
  { to: '/owner/profile', labelKey: 'nav.profile', icon: <HiOutlineUserCircle /> },
  { to: '/owner/settings', labelKey: 'nav.settings', icon: <HiOutlineCog6Tooth /> },
];

function resolveOwnerTitle(pathname, t) {
  const matched = [...ownerNavItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));

  return matched ? t(matched.labelKey) : t('common.workspace');
}

export default function OwnerLayout() {
  const { user, logout } = useContext(AuthContext);
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const mobileTitle = useMemo(
    () => resolveOwnerTitle(location.pathname, t),
    [location.pathname, t],
  );

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`owner-layout ios-app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
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
        <div className="sidebar-subtitle">{t('layout.ownerWorkspace')}</div>
        <nav>
          {ownerNavItems.map((item) => (
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
            <span className="topbar-eyebrow">{t('layout.ownerApp')}</span>
            <h3>{t('layout.welcome', { name: user?.name || t('common.owner') })}</h3>
            <p>{user?.email || t('layout.manageProperties')}</p>
          </div>
          <div className="topbar-copy mobile-copy">
            <span className="topbar-eyebrow">{t('common.appName')}</span>
            <h3>{mobileTitle}</h3>
            <p>{user?.name || t('common.owner')}</p>
          </div>
          <div className="user-menu">
            <div className="topbar-avatar">
              <span>{(user?.name || 'O').trim().charAt(0).toUpperCase()}</span>
            </div>
            <NotificationList />
          </div>
        </header>
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>

      <MobileBottomNav
        primaryItems={ownerPrimaryItems}
        secondaryItems={ownerSecondaryItems}
        logoutPath="/login"
      />
    </div>
  );
}
