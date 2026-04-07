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

const RAW_MICROSOFT_SCOPES =
  process.env.EXPO_PUBLIC_MS_SCOPES ||
  Constants.expoConfig?.extra?.microsoftScopes ||
  "openid profile email offline_access";

export const MICROSOFT_SCOPES = RAW_MICROSOFT_SCOPES.split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

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
