import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSocket } from './SocketContext';
import { AuthContext } from './AuthContext';
import { API_BASE_URL } from '../config/api';

export const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user, token } = useContext(AuthContext);
  const socket = useSocket();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!user || !token) {
      setNotifications([]);
      return;
    }

    const fetchNotifications = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
          setNotifications(
            items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          );
        }
      } catch (err) {
        console.error('Error fetching notifications:', err);
      }
    };

    fetchNotifications();
  }, [user, token]);

  useEffect(() => {
    const currentSocket = socket?.current;
    if (!currentSocket) return;

    const handleNewNotification = (notification) => {
      setNotifications((prev) => {
        if (prev.some((n) => n._id === notification._id)) return prev;
        return [notification, ...prev];
      });
    };

    currentSocket.on('newNotification', handleNewNotification);

    return () => {
      currentSocket.off('newNotification', handleNewNotification);
    };
  }, [socket]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const markAsRead = async (id) => {
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n._id === id ? { ...n, read: true } : n))
        );
      }
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  return (
    <NotificationContext.Provider
      value={{ notifications, setNotifications, unreadCount, markAsRead }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
