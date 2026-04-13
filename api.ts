import Constants from "expo-constants";

const RAW_API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  "https://xv2pbkqkl5.execute-api.us-east-2.amazonaws.com/dev/chat";

export const API_URL = RAW_API_URL.replace(/\/$/, "");

const RAW_LOGIN_URL =
  process.env.EXPO_PUBLIC_LOGIN_URL ||
  Constants.expoConfig?.extra?.loginUrl ||
  "";

export const LOGIN_URL = RAW_LOGIN_URL.replace(/\/$/, "");

const RAW_MICROSOFT_CLIENT_ID =
  process.env.EXPO_PUBLIC_MS_CLIENT_ID ||
  Constants.expoConfig?.extra?.microsoftClientId ||
  "";

export const MICROSOFT_CLIENT_ID = RAW_MICROSOFT_CLIENT_ID.trim();

const RAW_MICROSOFT_TENANT_ID =
  process.env.EXPO_PUBLIC_MS_TENANT_ID ||
  Constants.expoConfig?.extra?.microsoftTenantId ||
  "common";

export const MICROSOFT_TENANT_ID = RAW_MICROSOFT_TENANT_ID.trim();

const RAW_MICROSOFT_REDIRECT_URI =
  process.env.EXPO_PUBLIC_MS_REDIRECT_URI ||
  Constants.expoConfig?.extra?.microsoftRedirectUri ||
  "msauth.com.opxai.buddy.app://auth";

export const MICROSOFT_REDIRECT_URI = RAW_MICROSOFT_REDIRECT_URI.trim();

const RAW_MICROSOFT_SCOPES =
  process.env.EXPO_PUBLIC_MS_SCOPES ||
  Constants.expoConfig?.extra?.microsoftScopes ||
  "openid profile email offline_access User.Read";

const parsedMicrosoftScopes = RAW_MICROSOFT_SCOPES.split(/[ ,]+/)
  .map((scope: string) => scope.trim())
  .filter(Boolean);

// Keep parity with the web flow, which requests User.Read explicitly.
export const MICROSOFT_SCOPES = parsedMicrosoftScopes.includes("User.Read")
  ? parsedMicrosoftScopes
  : [...parsedMicrosoftScopes, "User.Read"];

const RAW_FIREBASE_API_KEY =
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
  process.env.EXPO_FIREBASE_API_KEY ||
  Constants.expoConfig?.extra?.firebaseApiKey ||
  "";

const RAW_FIREBASE_AUTH_DOMAIN =
  process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
  process.env.EXPO_FIREBASE_AUTH_DOMAIN ||
  Constants.expoConfig?.extra?.firebaseAuthDomain ||
  "";

const RAW_FIREBASE_PROJECT_ID =
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.EXPO_FIREBASE_PROJECT_ID ||
  Constants.expoConfig?.extra?.firebaseProjectId ||
  "";

const RAW_FIREBASE_APP_ID =
  process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
  process.env.EXPO_FIREBASE_APP_ID ||
  Constants.expoConfig?.extra?.firebaseAppId ||
  "";

const RAW_FIREBASE_STORAGE_BUCKET =
  process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  process.env.EXPO_FIREBASE_STORAGE_BUCKET ||
  Constants.expoConfig?.extra?.firebaseStorageBucket ||
  "";

const RAW_FIREBASE_MESSAGING_SENDER_ID =
  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
  process.env.EXPO_FIREBASE_MESSAGING_SENDER_ID ||
  Constants.expoConfig?.extra?.firebaseMessagingSenderId ||
  "";

const RAW_FIREBASE_MEASUREMENT_ID =
  process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ||
  process.env.EXPO_FIREBASE_MEASUREMENT_ID ||
  Constants.expoConfig?.extra?.firebaseMeasurementId ||
  "";

const firebaseProjectId = RAW_FIREBASE_PROJECT_ID.trim();
const firebaseAuthDomain =
  RAW_FIREBASE_AUTH_DOMAIN.trim() ||
  (firebaseProjectId ? `${firebaseProjectId}.firebaseapp.com` : "");

export const FIREBASE_CONFIG = {
  apiKey: RAW_FIREBASE_API_KEY.trim(),
  authDomain: firebaseAuthDomain,
  projectId: firebaseProjectId,
  storageBucket: RAW_FIREBASE_STORAGE_BUCKET.trim(),
  messagingSenderId: RAW_FIREBASE_MESSAGING_SENDER_ID.trim(),
  appId: RAW_FIREBASE_APP_ID.trim(),
  measurementId: RAW_FIREBASE_MEASUREMENT_ID.trim(),
};

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
