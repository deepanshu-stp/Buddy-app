import { AUTH_STORAGE_KEY } from "@/constants/auth";
import { signInWithMicrosoftTokens } from "@/firebase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LOGIN_URL, MICROSOFT_CLIENT_ID, MICROSOFT_TENANT_ID } from "../../api";

type LoginScreenProps = {
  onLoginSuccess?: () => void;
};

type LoginPhase =
  | "init"
  | "microsoft_auth"
  | "firebase_signin"
  | "api_login"
  | "storage";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
};

const validateLoginUrl = (rawUrl: string): string => {
  if (!rawUrl) {
    throw new Error(
      "Missing EXPO_PUBLIC_LOGIN_URL. Add it to your build env or app config extra.loginUrl.",
    );
  }

  try {
    const parsed = new URL(rawUrl);
    if (!parsed.protocol.startsWith("http")) {
      throw new Error("Login URL must use http or https.");
    }
    return parsed.toString();
  } catch (error) {
    throw new Error(`Invalid login URL: ${rawUrl}. ${getErrorMessage(error)}`);
  }
};

const LoginScreen = ({ onLoginSuccess }: LoginScreenProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "msauth.com.opxai.buddy.app",
    path: "auth",
  });
  console.log("Redirect URI:", redirectUri);

  const discovery = AuthSession.useAutoDiscovery(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/v2.0`,
  );

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: MICROSOFT_CLIENT_ID,
      redirectUri,
      scopes: ["openid", "profile", "email"],
      responseType: AuthSession.ResponseType.IdToken,
      extraParams: {
        response_mode: "fragment",
        prompt: "select_account",
      },
    },
    discovery,
  );

  const handleMicrosoftLogin = async () => {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_TENANT_ID) {
      Alert.alert(
        "Login Unavailable",
        "Microsoft auth settings are missing. Check your .env file.",
      );
      return;
    }

    if (!request || !discovery) {
      Alert.alert("Login Unavailable", "Auth session is not ready yet.");
      return;
    }

    setIsLoading(true);
    let phase: LoginPhase = "init";

    try {
      const loginUrl = validateLoginUrl(LOGIN_URL);

      phase = "microsoft_auth";
      const result = await promptAsync({
        showInRecents: true,
      });

      if (result.type !== "success") {
        return;
      }

      const idToken = result.authentication?.idToken?.trim() || "";
      const accessToken = result.authentication?.accessToken?.trim() || "";

      console.log("Microsoft authentication:", result.authentication);

      if (!idToken) {
        throw new Error("Missing idToken from Microsoft login.");
      }

      const encodedPayload = idToken.split(".")[1];
      const normalizedPayload = encodedPayload
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=");
      const decodedTokenPayload = JSON.parse(atob(normalizedPayload)) as {
        aud?: string;
      };

      console.log("Decoded ID token:", decodedTokenPayload);

      if (decodedTokenPayload.aud !== MICROSOFT_CLIENT_ID) {
        throw new Error(
          `Invalid idToken audience. Expected ${MICROSOFT_CLIENT_ID}, got ${decodedTokenPayload.aud ?? "unknown"}.`,
        );
      }

      let apiBearerToken: string | null = null;

      // Microsoft -> Firebase sign-in
      phase = "firebase_signin";
      try {
        const firebaseResult = await signInWithMicrosoftTokens({
          idToken,
          accessToken,
        });

        const firebaseUser = firebaseResult.user;
        if (!firebaseUser) {
          throw new Error("Firebase login succeeded but user is unavailable.");
        }

        // Firebase ID token is preferred for backend auth.
        apiBearerToken = await firebaseUser.getIdToken(true);
      } catch (firebaseError) {
        throw new Error(
          `Firebase sign-in failed. ${getErrorMessage(firebaseError)} Backend login requires a Firebase ID token. Verify Firebase Auth > Sign-in method > Microsoft provider configuration (client ID/secret and tenant).`,
        );
      }

      if (!apiBearerToken) {
        throw new Error("No bearer token available for login API.");
      }

      const trimmedBearerToken = apiBearerToken.trim();

      console.log("TOKEN LENGTH:", trimmedBearerToken.length);
      console.log("TOKEN START:", trimmedBearerToken.slice(0, 20));
      console.log("TOKEN END:", trimmedBearerToken.slice(-20));

      if (__DEV__) {
        console.log("Sending Firebase ID token to login API", {
          url: loginUrl,
          hasAuthorization: true,
          authSource: "firebase",
        });
      }

      phase = "api_login";
      const response = await fetch(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${trimmedBearerToken}`,
          "X-Auth-Source": "firebase",
        },
        body: JSON.stringify({
          redirectUri,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Login exchange failed: ${response.status} ${body}`);
      }

      const json = (await response.json()) as {
        token?: string;
        access_token?: string;
        [key: string]: unknown;
      };

      const payload = {
        token: apiBearerToken,
        raw: {
          authSource: "firebase",
          microsoft: result.authentication,
          api: json,
        },
        receivedAt: new Date().toISOString(),
      };

      phase = "storage";
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));

      onLoginSuccess?.();
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Microsoft login failed:", {
        phase,
        message,
        rawError: error,
      });

      Alert.alert(
        "Login Failed",
        `Step: ${phase}\n${message}\n\nIf step is api_login and AWS logs are empty, verify EXPO_PUBLIC_LOGIN_URL in the iOS build env.`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* OPX Ai Branding */}
        <View style={styles.brandContainer}>
          <Image
            source={require("@/assets/images/logo.png")}
            style={styles.brandLogo}
          />

          <Text style={styles.brandText}>
            OPX <Text style={styles.brandAi}>Ai</Text>
          </Text>
        </View>

        {/* Welcome Text */}
        <Text style={styles.title}>Welcome to Buddy</Text>

        <Text style={styles.subtitle}>Sign in with Microsoft to continue</Text>

        {/* Microsoft Login Button */}
        <TouchableOpacity
          onPress={handleMicrosoftLogin}
          style={[styles.button, isLoading && styles.buttonDisabled]}
          activeOpacity={0.85}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <View style={styles.buttonContent}>
              {/* Microsoft Logo */}
              <Image
                source={require("@/assets/microsoft.png")}
                style={styles.microsoftIcon}
              />

              <Text style={styles.buttonText}>Continue with Microsoft</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 28,

    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 8,
    },

    elevation: 6,
  },

  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  brandLogo: {
    width: 50,
    height: 50,
    resizeMode: "contain",

    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },

    elevation: 4,
  },

  brandText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    letterSpacing: 0.5,
  },

  brandAi: {
    fontWeight: "900",
  },

  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
  },

  subtitle: {
    fontSize: 15,
    color: "#64748b",
    textAlign: "center",
    marginTop: 28,
    marginBottom: 24,
  },

  button: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    width: "75%",
    margin: "auto",
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  microsoftIcon: {
    width: 20,
    height: 20,
    resizeMode: "contain",
  },

  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
  },
});
