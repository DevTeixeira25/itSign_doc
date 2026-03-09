import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

let app: App;

if (getApps().length === 0) {
  // In production, use GOOGLE_APPLICATION_CREDENTIALS or a service account JSON.
  // For development, projectId-only init still allows verifyIdToken()
  // because it fetches Google's public signing keys automatically.
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccount) {
    app = initializeApp({
      credential: cert(JSON.parse(serviceAccount)),
    });
  } else {
    // Dev mode: projectId-only. Token verification fetches public keys from Google.
    initializeApp({ projectId: "itsign-79d36" });
    app = getApps()[0];
  }
} else {
  app = getApps()[0];
}

const adminAuth = getAuth(app);

/**
 * Verify a Firebase ID token and return decoded claims.
 * Throws on invalid / expired tokens.
 */
export async function verifyFirebaseToken(idToken: string): Promise<DecodedIdToken> {
  return adminAuth.verifyIdToken(idToken);
}

export { adminAuth };
