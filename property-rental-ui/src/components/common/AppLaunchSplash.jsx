import { useEffect, useState } from 'react';
import './AppLaunchSplash.css';

const SPLASH_SESSION_KEY = 'deranowLaunchSplashSeen';

export default function AppLaunchSplash() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(SPLASH_SESSION_KEY) !== '1';
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return undefined;

    const leaveTimer = window.setTimeout(() => setLeaving(true), 1400);
    const removeTimer = window.setTimeout(() => {
      sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
      setVisible(false);
    }, 1850);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className={`app-launch-splash${leaving ? ' is-leaving' : ''}`} aria-hidden="true">
      <div className="app-launch-mark">
        <img src="/dera.png" alt="" />
      </div>
      <div className="app-launch-copy">
        <h1>DeraNow</h1>
        <p>Find rooms, flats, and homes</p>
      </div>
      <div className="app-launch-loader">
        <span />
      </div>
    </div>
  );
}
