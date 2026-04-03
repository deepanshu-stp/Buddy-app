import { AUTH_STORAGE_KEY } from "@/constants/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LOGIN_URL } from "../../api";

WebBrowser.maybeCompleteAuthSession();

type LoginScreenProps = {
  onLoginSuccess: () => void;
};

const extractTokenFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);

    const queryToken = parsed.searchParams.get("token");
    const queryAccessToken =
      parsed.searchParams.get("access_token");

    if (queryToken || queryAccessToken) {
      return queryToken ?? queryAccessToken ?? undefined;
    }

    const hash = parsed.hash?.replace(/^#/, "");
    if (!hash) return undefined;

    const hashParams = new URLSearchParams(hash);

    return (
      hashParams.get("token") ??
      hashParams.get("access_token") ??
      undefined
    );
  } catch {
    return undefined;
  }
};

const LoginScreen = ({ onLoginSuccess }: LoginScreenProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleMicrosoftLogin = async () => {
    if (!LOGIN_URL) {
      Alert.alert(
        "Login Unavailable",
        "Login URL is missing. Check your .env file.",
      );
      return;
    }

    setIsLoading(true);

    try {
      const redirectUri = Linking.createURL("auth");

      const result =
        await WebBrowser.openAuthSessionAsync(
          LOGIN_URL,
          redirectUri,
        );

      if (result.type !== "success" || !result.url) {
        return;
      }

      const token = extractTokenFromUrl(result.url);

      const payload = {
        url: result.url,
        token: token ?? null,
        receivedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify(payload),
      );

      onLoginSuccess();
    } catch (error) {
      console.error("Microsoft login failed:", error);

      Alert.alert(
        "Login Failed",
        "Unable to complete Microsoft login.",
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
        <Text style={styles.title}>
          Welcome to Buddy
        </Text>

        <Text style={styles.subtitle}>
          Sign in with Microsoft to continue
        </Text>

        {/* Microsoft Login Button */}
        <TouchableOpacity
          onPress={handleMicrosoftLogin}
          style={[
            styles.button,
            isLoading && styles.buttonDisabled,
          ]}
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

              <Text style={styles.buttonText}>
                Continue with Microsoft
              </Text>

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