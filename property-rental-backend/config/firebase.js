import admin from 'firebase-admin';

let initialized = false;

const getServiceAccount = () => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;

  try {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (err) {
    console.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
    return null;
  }
};

export const getFirebaseMessaging = () => {
  if (!initialized) {
    const serviceAccount = getServiceAccount();

    if (!serviceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return null;
    }

    try {
      admin.initializeApp(
        serviceAccount
          ? { credential: admin.credential.cert(serviceAccount) }
          : { credential: admin.credential.applicationDefault() }
      );
      initialized = true;
    } catch (err) {
      if (err?.code !== 'app/duplicate-app') {
        console.error('Firebase initialization failed:', err.message);
        return null;
      }
      initialized = true;
    }
  }

  return admin.messaging();
};
