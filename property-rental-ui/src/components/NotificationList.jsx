import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationContext } from '../context/NotificationContext';
import { AuthContext } from '../context/AuthContext';
import './NotificationList.css';

export default function NotificationList() {
  const { notifications, unreadCount, markAsRead } =
    useContext(NotificationContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const roleHome =
    user?.role === 'owner' || user?.role === 'renter' ? `/${user.role}` : '/login';

  const resolveNotificationLink = (link, type) => {
    if (!link) return null;
    if (/^https?:\/\//i.test(link)) return link;

    const normalized = link.startsWith('/') ? link : `/${link}`;

    // Legacy backend links that don't exist in current UI routes.
    if (normalized.startsWith('/bookings/')) {
      return user?.role === 'owner' ? '/owner/requests' : '/renter/bookings';
    }
    if (normalized.startsWith('/payments/')) {
      return '/renter/payments';
    }
    if (type === 'listingApproval' && normalized === '/owner/properties') {
      if (user?.role === 'owner') return '/owner/properties';
      return '/renter/listings';
    }

    // Route correction for message page based on role.
    if (normalized === '/renter/message' && user?.role === 'owner') {
      return '/owner/messages';
    }
    if (normalized === '/owner/messages' && user?.role === 'renter') {
      return '/renter/message';
    }

    // Avoid role-mismatch redirects from protected routes.
    if (normalized.startsWith('/owner') && user?.role !== 'owner') return roleHome;
    if (normalized.startsWith('/renter') && user?.role !== 'renter') return roleHome;
    if (normalized.startsWith('/admin')) return roleHome;

    return normalized;
  };

  const handleNotificationClick = async (notification) => {
    await markAsRead(notification._id);
    setOpen(false);
    const target = resolveNotificationLink(notification.link, notification.type);
    if (!target) return;
    if (/^https?:\/\//i.test(target)) {
      window.location.assign(target);
      return;
    }
    navigate(target);
  };

  const formatRelativeTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="notification-dropdown">
      <button onClick={() => setOpen(!open)}>
        🔔 {unreadCount > 0 && <span>({unreadCount})</span>}
      </button>
      {open && (
        <div className="notification-list">
          <div className="notification-header">
            <h4>Notifications</h4>
            <span>{unreadCount} unread</span>
          </div>
          {notifications.length === 0 ? (
            <p className="notification-empty">No notifications</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n._id}
                className={`notification ${n.read ? 'read' : 'unread'}`}
                onClick={() => handleNotificationClick(n)}
              >
                <div className="notification-row">
                  <span className={`notification-type ${n.read ? 'read' : 'unread'}`}>
                    {n.type || 'update'}
                  </span>
                  <span className="notification-time">{formatRelativeTime(n.createdAt)}</span>
                </div>
                <p>{n.message}</p>
                {n.link && (
                  <button
                    type="button"
                    className="notification-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNotificationClick(n);
                    }}
                  >
                    View
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
