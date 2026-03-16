import Constants from "expo-constants";

const RAW_API_URL =
  Constants.expoConfig?.extra?.apiUrl || "https://xv2pbkqkl5.execute-api.us-east-2.amazonaws.com/dev/chat";

export const API_URL = RAW_API_URL.replace(/\/$/, "");

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
