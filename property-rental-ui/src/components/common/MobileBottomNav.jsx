import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { HiOutlineEllipsisHorizontalCircle } from 'react-icons/hi2';
import { AuthContext } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import './MobileBottomNav.css';

export default function MobileBottomNav({
  primaryItems,
  secondaryItems,
  logoutPath = '/login',
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);
  const { t } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const lastScrollY = useRef(0);

  const sheetItems = useMemo(() => {
    const seen = new Set();
    return [...primaryItems, ...secondaryItems].filter((item) => {
      if (seen.has(item.to)) return false;
      seen.add(item.to);
      return true;
    });
  }, [primaryItems, secondaryItems]);

  const handleLogout = () => {
    logout();
    setMoreOpen(false);
    navigate(logoutPath, { replace: true });
  };

  useEffect(() => {
    setMoreOpen(false);
    setIsCollapsed(false);
  }, [location.pathname]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');

    const handleScroll = () => {
      if (!media.matches || moreOpen) return;

      const currentScrollY = Math.max(
        window.scrollY || 0,
        document.documentElement.scrollTop || 0,
      );

      if (currentScrollY <= 24) {
        setIsCollapsed(false);
        lastScrollY.current = currentScrollY;
        return;
      }

      const delta = currentScrollY - lastScrollY.current;

      if (delta > 10) {
        setIsCollapsed(true);
      } else if (delta < -10) {
        setIsCollapsed(false);
      }

      lastScrollY.current = currentScrollY;
    };

    const handleResize = () => {
      if (!media.matches) {
        setIsCollapsed(false);
      }
    };

    lastScrollY.current = Math.max(
      window.scrollY || 0,
      document.documentElement.scrollTop || 0,
    );

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [moreOpen]);

  return (
    <>
      {moreOpen && (
        <button
          type="button"
          className="mobile-nav-backdrop"
          onClick={() => setMoreOpen(false)}
          aria-label={t('layout.closeMobileNavigation')}
        />
      )}

      {moreOpen && (
        <div className="mobile-nav-sheet" id="mobile-nav-sheet">
          <div className="mobile-nav-sheet-handle" />
          <div className="mobile-nav-sheet-header">
            <h4>{t('common.navigation')}</h4>
            <p>{t('common.quickAccess')}</p>
          </div>
          <div className="mobile-nav-sheet-grid">
            {sheetItems.map((item) => (
              <NavLink key={item.to} to={item.to} className="mobile-nav-sheet-link">
                <span className="mobile-nav-sheet-icon">{item.icon}</span>
                <span>{item.labelKey ? t(item.labelKey) : item.label}</span>
              </NavLink>
            ))}
            <button
              type="button"
              className="mobile-nav-sheet-link mobile-nav-sheet-link-danger"
              onClick={handleLogout}
            >
              <span className="mobile-nav-sheet-icon">↗</span>
              <span>{t('common.logout')}</span>
            </button>
          </div>
        </div>
      )}

      <nav
        className={`mobile-bottom-nav${isCollapsed ? ' collapsed' : ''}${moreOpen ? ' menu-open' : ''}`}
        aria-label="Bottom navigation"
      >
        {primaryItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `mobile-bottom-nav-link${isActive ? ' active' : ''}`
            }
          >
            <span className="mobile-bottom-nav-icon">{item.icon}</span>
            <span className="mobile-bottom-nav-label">{item.labelKey ? t(item.labelKey) : item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`mobile-bottom-nav-link mobile-bottom-nav-more ${moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen((prev) => !prev)}
          aria-expanded={moreOpen}
          aria-controls="mobile-nav-sheet"
          aria-label={isCollapsed ? t('layout.openNavigationMenu') : t('layout.openMoreNavigation')}
        >
          <span className="mobile-bottom-nav-icon">
            <HiOutlineEllipsisHorizontalCircle />
          </span>
          <span className="mobile-bottom-nav-label">{t('common.more')}</span>
        </button>
      </nav>
    </>
  );
}
