import { getApps, initializeApp } from "firebase/app";
import {
  type Auth,
  type UserCredential,
  getAuth,
  initializeAuth,
  OAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import { FIREBASE_CONFIG } from "../api";

export type MicrosoftCredentialInput = {
  idToken: string;
  accessToken?: string;
};

const app =
  getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];

const authGlobal = globalThis as typeof globalThis & {
  __BUDDY_FIREBASE_AUTH__?: Auth;
};

const createFirebaseAuth = (): Auth => {
  if (authGlobal.__BUDDY_FIREBASE_AUTH__) {
    return authGlobal.__BUDDY_FIREBASE_AUTH__;
  }

  try {
    const auth = initializeAuth(app);
    authGlobal.__BUDDY_FIREBASE_AUTH__ = auth;
    return auth;
  } catch (error) {
    const maybeError = error as { code?: string; message?: string };
    const isAlreadyInitialized =
      maybeError.code === "auth/already-initialized" ||
      maybeError.message?.includes("already been initialized");

    if (isAlreadyInitialized) {
      const auth = getAuth(app);
      authGlobal.__BUDDY_FIREBASE_AUTH__ = auth;
      return auth;
    }

    throw error;
  }
};

export const firebaseAuth = createFirebaseAuth();

export const signInWithMicrosoftTokens = async (
  tokens: MicrosoftCredentialInput,
): Promise<UserCredential> => {
  const idToken = tokens.idToken?.trim();
  const accessToken = tokens.accessToken?.trim();

  if (!idToken) {
    throw new Error("Microsoft ID token is required.");
  }

  const provider = new OAuthProvider("microsoft.com");
  const credential = provider.credential({
    idToken,
    ...(accessToken ? { accessToken } : {}),
  });

  return signInWithCredential(firebaseAuth, credential);
};
