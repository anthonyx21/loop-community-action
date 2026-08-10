import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { collection, doc, getFirestore, onSnapshot, orderBy, query } from 'firebase/firestore';

const env = import.meta.env;
// Only public Firebase and Maps values belong in Vite. Gemini and Firebase Admin
// credentials remain exclusively in the Cloud Run backend.
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);
export const hasGoogleConfiguration = Boolean(
  hasFirebaseConfig &&
  env.VITE_GOOGLE_MAPS_API_KEY &&
  env.VITE_LOOP_API_BASE_URL &&
  env.VITE_LOOP_ORGANIZATION_ID,
);
export const missingGoogleConfiguration = [
  !firebaseConfig.apiKey && 'VITE_FIREBASE_API_KEY',
  !firebaseConfig.authDomain && 'VITE_FIREBASE_AUTH_DOMAIN',
  !firebaseConfig.projectId && 'VITE_FIREBASE_PROJECT_ID',
  !firebaseConfig.appId && 'VITE_FIREBASE_APP_ID',
  !env.VITE_GOOGLE_MAPS_API_KEY && 'VITE_GOOGLE_MAPS_API_KEY',
  !env.VITE_LOOP_API_BASE_URL && 'VITE_LOOP_API_BASE_URL',
  !env.VITE_LOOP_ORGANIZATION_ID && 'VITE_LOOP_ORGANIZATION_ID',
].filter(Boolean);
const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

const normalizeDocument = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });

/** Starts Firebase Google sign-in and returns the user plus an optional Gmail read token. */
export function signInWithGoogle() {
  if (!auth) throw new Error('Firebase configuration is required before Google sign-in.');
  const provider = new GoogleAuthProvider();
  // The short-lived token returned by this grant is used only when a member
  // explicitly imports a Gmail message through the secured backend.
  provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
  return signInWithPopup(auth, provider).then((result) => ({
    user: result.user,
    gmailAccessToken: GoogleAuthProvider.credentialFromResult(result)?.accessToken || null,
  }));
}

/** Registers a listener for Firebase authentication changes and returns its unsubscribe function. */
export function observeUser(callback) {
  if (!auth) throw new Error('Firebase configuration is required before observing authentication.');
  return onAuthStateChanged(auth, callback);
}

// The UI is a live view of these organization-scoped Firestore documents.
// Server-side mutations go through Cloud Run; client listeners are read-only.
// Firestore schema:
// organizations/{organizationId}/offers/{offerId}
// organizations/{organizationId}/needs/{needId}
// organizations/{organizationId}/responsePlans/{planId}
// organizations/{organizationId}/impactReceipts/{receiptId}
// organizations/{organizationId}/dashboard/current
/**
 * Subscribes to every live collection needed by the mobile workflow.
 * Each callback contains only the collection/document that changed; callers merge updates into state.
 */
export function subscribeToLoopData(organizationId, callback, onError = console.error) {
  if (!db) throw new Error('Firebase configuration is required before subscribing to Loop data.');
  const root = `organizations/${organizationId}`;
  const offers = onSnapshot(
    query(collection(db, `${root}/offers`), orderBy('updatedAt', 'desc')),
    (snapshot) => callback({ offers: snapshot.docs.map(normalizeDocument) }),
    onError,
  );
  const needs = onSnapshot(
    query(collection(db, `${root}/needs`), orderBy('updatedAt', 'desc')),
    (snapshot) => callback({ needs: snapshot.docs.map(normalizeDocument) }),
    onError,
  );
  const responsePlans = onSnapshot(
    query(collection(db, `${root}/responsePlans`), orderBy('updatedAt', 'desc')),
    (snapshot) => callback({ responsePlans: snapshot.docs.map(normalizeDocument) }),
    onError,
  );
  const impactReceipts = onSnapshot(
    query(collection(db, `${root}/impactReceipts`), orderBy('updatedAt', 'desc')),
    (snapshot) => callback({ impactReceipts: snapshot.docs.map(normalizeDocument) }),
    onError,
  );
  const dashboard = onSnapshot(
    doc(db, `${root}/dashboard/current`),
    (snapshot) => callback({ dashboard: snapshot.exists() ? normalizeDocument(snapshot) : null }),
    onError,
  );
  return () =>
    [offers, needs, responsePlans, impactReceipts, dashboard].forEach((unsubscribe) =>
      unsubscribe(),
    );
}

/**
 * Calls an authenticated Cloud Run workflow endpoint. Network and 5xx failures
 * retry with exponential backoff; client errors are returned immediately.
 */
async function request(path, body, user, method = 'POST') {
  const baseUrl = env.VITE_LOOP_API_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('VITE_LOOP_API_BASE_URL is required for workflow actions.');
  const idToken = auth && user ? await user.getIdToken() : null;
  // Keep one key for all retry attempts so infrastructure can safely identify
  // repeated submissions of the same user action.
  const idempotencyKey = crypto.randomUUID();
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Loop-Organization-Id': env.VITE_LOOP_ORGANIZATION_ID,
          'Idempotency-Key': idempotencyKey,
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (response.ok) return response.json();
      const message =
        (await response.json().catch(() => ({}))).message ||
        'Google Cloud workflow request failed.';
      if (response.status < 500 || attempt === 2) throw new Error(message);
      lastError = new Error(message);
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
  }
  throw lastError;
}

export const submitForwardedEmail = (payload, user) =>
  request('/v1/intake/forwarded-email', payload, user);
export const importGmailMessage = (payload, user) => request('/v1/gmail/import', payload, user);
export const createNeed = (payload, user) => request('/v1/needs', payload, user);
export const reviewOffer = (offerId, status, user) =>
  request(`/v1/offers/${offerId}/review`, { status }, user, 'PATCH');
export const createResponsePlan = (needId, user) => request('/v1/response-plans', { needId }, user);
export const approveResponsePlan = (planId, user) =>
  request(`/v1/response-plans/${planId}/approve`, {}, user);
export const activateResponsePlan = (planId, user) =>
  request(`/v1/response-plans/${planId}/activate`, {}, user);

/** Returns the Maps Embed directions URL used as context in a response plan. */
export function mapsEmbedUrl(
  origin = '125 King Street West, Toronto, ON',
  destination = 'North District Transit Station, Toronto, ON',
) {
  const key = env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('VITE_GOOGLE_MAPS_API_KEY is required to render route context.');
  return `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving`;
}
