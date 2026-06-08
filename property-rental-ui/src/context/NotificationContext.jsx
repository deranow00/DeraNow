import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useSocket } from './SocketContext';
import { AuthContext } from './AuthContext';
import { API_BASE_URL } from '../config/api';

export const NotificationContext = createContext();

const canUseBrowserNotifications = () =>
  typeof window !== 'undefined' && 'Notification' in window;

const canUseNativePush = () =>
  typeof window !== 'undefined' && Capacitor.isNativePlatform();

const isAndroidPushConfigured = () => {
  if (!canUseNativePush()) return false;
  if (Capacitor.getPlatform() !== 'android') return true;
  return typeof window !== 'undefined' && window.__DERANOW_ANDROID_PUSH_ENABLED__ === true;
};

const getNativePushErrorMessage = (err) => {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return err.message || err.toString?.() || 'Unknown push error';
};

const isMissingFirebaseConfigError = (err) => {
  const message = getNativePushErrorMessage(err).toLowerCase();
  return (
    message.includes('firebaseapp is not initialized') ||
    message.includes('default firebaseapp is not initialized') ||
    message.includes('google-services.json') ||
    message.includes('firebase')
  );
};

export const NotificationProvider = ({ children }) => {
  const { user, token } = useContext(AuthContext);
  const socket = useSocket();
  const nativePushDisabledRef = useRef(false);
  const [notifications, setNotifications] = useState([]);
  const [phoneNotificationPermission, setPhoneNotificationPermission] = useState(() =>
    canUseBrowserNotifications() ? Notification.permission : 'unsupported'
  );
  const [nativePushPermission, setNativePushPermission] = useState(() =>
    canUseNativePush() ? 'prompt' : 'unsupported'
  );
  const [nativePushMessage, setNativePushMessage] = useState('');

  const savePushToken = async (pushToken) => {
    if (!token || !pushToken) return;
    await fetch(`${API_BASE_URL}/api/notifications/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        token: pushToken,
        platform: Capacitor.getPlatform(),
      }),
    });
  };

  const registerNativePushNotifications = async () => {
    if (!canUseNativePush()) {
      setNativePushPermission('unsupported');
      return 'unsupported';
    }

    if (!isAndroidPushConfigured()) {
      const message =
        'Android push notifications are not configured in this build yet. Add the Firebase Android config file (google-services.json) for com.deranow.app.';
      nativePushDisabledRef.current = true;
      setNativePushPermission('unavailable');
      setNativePushMessage(message);
      return 'unavailable';
    }

    if (nativePushDisabledRef.current) {
      setNativePushPermission('unavailable');
      return 'unavailable';
    }

    const permission = await PushNotifications.requestPermissions();
    const status = permission.receive || 'denied';
    setNativePushPermission(status);
    if (status !== 'granted') return status;

    if (Capacitor.getPlatform() === 'android') {
      await PushNotifications.createChannel({
        id: 'deranow_default',
        name: 'DeraNow notifications',
        description: 'Booking, payment, message, and account updates.',
        importance: 5,
        visibility: 1,
        sound: 'default',
      }).catch(() => {});
    }

    try {
      await PushNotifications.register();
      setNativePushMessage('');
      nativePushDisabledRef.current = false;
      return status;
    } catch (err) {
      if (isMissingFirebaseConfigError(err)) {
        const message =
          'Android push notifications are not configured in this build yet. Add the Firebase Android config file (google-services.json) for com.deranow.app.';
        console.error(message, err);
        nativePushDisabledRef.current = true;
        setNativePushPermission('unavailable');
        setNativePushMessage(message);
        return 'unavailable';
      }

      const message = getNativePushErrorMessage(err) || 'Push registration failed.';
      console.error('Push registration failed:', err);
      setNativePushPermission('denied');
      setNativePushMessage(message);
      return 'denied';
    }
  };

  const requestPhoneNotifications = async () => {
    if (canUseNativePush()) {
      return registerNativePushNotifications();
    }

    if (!canUseBrowserNotifications()) {
      setPhoneNotificationPermission('unsupported');
      return 'unsupported';
    }
    const permission = await Notification.requestPermission();
    setPhoneNotificationPermission(permission);
    return permission;
  };

  useEffect(() => {
    if (!user || !canUseBrowserNotifications()) return;
    setPhoneNotificationPermission(Notification.permission);
  }, [user?._id]);

  useEffect(() => {
    if (user && token) return;
    nativePushDisabledRef.current = false;
    setNativePushMessage('');
    if (canUseNativePush()) {
      setNativePushPermission('prompt');
    }
  }, [user, token]);

  useEffect(() => {
    if (!user || !token || !canUseNativePush()) return undefined;

    if (!isAndroidPushConfigured()) {
      nativePushDisabledRef.current = true;
      setNativePushPermission('unavailable');
      setNativePushMessage(
        'Android push notifications are not configured in this build yet. Add the Firebase Android config file (google-services.json) for com.deranow.app.'
      );
      return undefined;
    }

    let mounted = true;
    const listeners = [];

    const setupPush = async () => {
      const currentPermission = await PushNotifications.checkPermissions();
      if (!mounted) return;
      setNativePushPermission(currentPermission.receive || 'prompt');
      if (nativePushDisabledRef.current) return;

      listeners.push(
        await PushNotifications.addListener('registration', ({ value }) => {
          nativePushDisabledRef.current = false;
          setNativePushMessage('');
          savePushToken(value).catch((err) => {
            console.error('Failed to save push token:', err);
          });
        })
      );

      listeners.push(
        await PushNotifications.addListener('registrationError', (err) => {
          console.error('Push registration error:', err);
        })
      );

      listeners.push(
        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          setNotifications((prev) => [
            {
              _id: notification.id || `push-${Date.now()}`,
              type: notification.data?.type || 'message',
              message: notification.body || notification.title || 'You have a new notification.',
              link: notification.data?.link || '',
              read: false,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ]);
        })
      );

      listeners.push(
        await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
          const link = event.notification?.data?.link;
          if (link) window.location.assign(link);
        })
      );

      if (currentPermission.receive === 'granted') {
        if (Capacitor.getPlatform() === 'android') {
          await PushNotifications.createChannel({
            id: 'deranow_default',
            name: 'DeraNow notifications',
            description: 'Booking, payment, message, and account updates.',
            importance: 5,
            visibility: 1,
            sound: 'default',
          }).catch(() => {});
        }
        try {
          await PushNotifications.register();
          setNativePushMessage('');
        } catch (err) {
          if (isMissingFirebaseConfigError(err)) {
            nativePushDisabledRef.current = true;
            setNativePushPermission('unavailable');
            setNativePushMessage(
              'Android push notifications are not configured in this build yet. Add the Firebase Android config file (google-services.json) for com.deranow.app.'
            );
            console.error(
              'Android push notifications are not configured in this build yet. Add the Firebase Android config file (google-services.json) for com.deranow.app.',
              err
            );
            return;
          }

          console.error('Push registration failed:', err);
          setNativePushPermission('denied');
          setNativePushMessage(getNativePushErrorMessage(err) || 'Push registration failed.');
        }
      }
    };

    setupPush().catch((err) => {
      console.error('Push setup failed:', err);
    });

    return () => {
      mounted = false;
      listeners.forEach((listener) => listener.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id, token]);

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

      if (
        canUseBrowserNotifications() &&
        Notification.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        const systemNotification = new Notification('DeraNow', {
          body: notification.message || 'You have a new notification.',
          icon: '/dera.png',
          tag: notification._id || notification.type || 'deranow-notification',
        });
        systemNotification.onclick = () => {
          window.focus();
        };
      }
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
      value={{
        notifications,
        setNotifications,
        unreadCount,
        markAsRead,
        phoneNotificationPermission,
        nativePushPermission,
        nativePushMessage,
        requestPhoneNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
