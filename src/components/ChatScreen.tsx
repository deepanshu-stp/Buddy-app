import AsyncStorage from "@react-native-async-storage/async-storage";
import { Mic, RefreshCw, Send } from "lucide-react-native";
import punycode from "punycode";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  NativeModules,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL, fetchWithTimeout } from "../../api";

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
}

interface ChatResponse {
  answer: string;
  [key: string]: unknown; // Allow additional fields for flexibility
}

type ChatHistoryItem = { role: "user" | "assistant"; content: string };

const CHAT_HISTORY_KEY = "chatHistory";
const MAX_CHAT_HISTORY = 5;

const isChatHistoryItem = (value: unknown): value is ChatHistoryItem => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<ChatHistoryItem>;
  const validRole = candidate.role === "user" || candidate.role === "assistant";
  return validRole && typeof candidate.content === "string";
};

const ChatMessageItem = memo(function ChatMessageItem({
  message,
}: {
  message: Message;
}) {
  const isUser = message.sender === "user";

  return (
    <View
      style={[
        styles.messageWrapper,
        isUser ? styles.messageWrapperUser : styles.messageWrapperBot,
      ]}
    >
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.messageBubbleUser : styles.messageBubbleBot,
        ]}
      >
        <TextInput
          value={message.text}
          editable={false}
          multiline
          contextMenuHidden={false}
          scrollEnabled={false}
          showSoftInputOnFocus={false}
          selectTextOnFocus
          style={[
            styles.messageTextSelectable,
            isUser
              ? styles.messageTextSelectableUser
              : styles.messageTextSelectableBot,
          ]}
        />
      </View>
    </View>
  );
});

interface VoiceModule {
  onSpeechPartialResults?: (event: { value?: string[] }) => void;
  onSpeechResults?: (event: { value?: string[] }) => void;
  onSpeechEnd?: () => void;
  onSpeechError?: (event: { error?: { message?: string } }) => void;
  start: (locale: string) => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
  removeAllListeners: () => void;
}

const isVoiceModule = (value: unknown): value is VoiceModule => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<VoiceModule>;
  return (
    typeof candidate.start === "function" &&
    typeof candidate.stop === "function" &&
    typeof candidate.destroy === "function" &&
    typeof candidate.removeAllListeners === "function"
  );
};

const normalizeApiUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    parsed.hostname = punycode.toASCII(parsed.hostname);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.replace(/\/$/, "");
  }
};

const SAFE_API_URL = normalizeApiUrl(API_URL);
const REQUEST_TIMEOUT_MS = 30000;

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const speechBaseTextRef = useRef("");
  const voiceRef = useRef<VoiceModule | null>(null);
  const hasLoggedVoiceUnavailableRef = useRef(false);
  const showScrollBtnRef = useRef(false);

  const getVoice = (): VoiceModule | null => {
    if (voiceRef.current) return voiceRef.current;

    if (Platform.OS === "web" || !NativeModules.Voice) {
      if (!hasLoggedVoiceUnavailableRef.current) {
        console.warn("Voice native module is not linked in this build.");
        hasLoggedVoiceUnavailableRef.current = true;
      }
      return null;
    }

    try {
      const voicePackage = require("@react-native-voice/voice") as
        | VoiceModule
        | { default?: VoiceModule }
        | undefined;
      const maybeVoice =
        voicePackage &&
        typeof voicePackage === "object" &&
        "default" in voicePackage
          ? voicePackage.default
          : voicePackage;

      if (!isVoiceModule(maybeVoice)) {
        return null;
      }

      voiceRef.current = maybeVoice;
      return maybeVoice;
    } catch (error) {
      if (!hasLoggedVoiceUnavailableRef.current) {
        console.warn("Voice module is unavailable in this build.", error);
        hasLoggedVoiceUnavailableRef.current = true;
      }
      return null;
    }
  };

  /* ------------------ Load history & model ------------------ */
  useEffect(() => {
    const loadChatHistory = async () => {
      const saved = await AsyncStorage.getItem(CHAT_HISTORY_KEY);

      if (!saved) return;

      try {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed)) {
          await AsyncStorage.removeItem(CHAT_HISTORY_KEY);
          return;
        }

        const validHistory = parsed.filter(isChatHistoryItem);
        if (validHistory.length === 0) return;

        setChatHistory(validHistory);
        setMessages(
          validHistory.map((m, i) => ({
            id: String(i),
            text: m.content,
            sender: m.role === "user" ? "user" : "bot",
          })),
        );
      } catch (error) {
        console.error("Failed to parse chat history:", error);
        await AsyncStorage.removeItem(CHAT_HISTORY_KEY);
      }
    };

    loadChatHistory();
  }, []);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useEffect(() => {
    console.log("[API] base URL:", SAFE_API_URL);
  }, []);

  useEffect(() => {
    const voice = getVoice();
    if (!voice) return;

    voice.onSpeechPartialResults = (event: { value?: string[] }) => {
      const transcript = event.value?.[0]?.trim();
      if (!transcript) return;
      setInputValue(`${speechBaseTextRef.current}${transcript}`.trim());
    };

    voice.onSpeechResults = (event: { value?: string[] }) => {
      const transcript = event.value?.[0]?.trim();
      if (!transcript) return;
      setInputValue(`${speechBaseTextRef.current}${transcript}`.trim());
    };

    voice.onSpeechEnd = () => {
      setIsListening(false);
      speechBaseTextRef.current = "";
    };

    voice.onSpeechError = (event: { error?: { message?: string } }) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      speechBaseTextRef.current = "";
    };

    return () => {
      voice.destroy().catch((err) => {
        console.error("Failed to destroy voice instance:", err);
      });
      voice.removeAllListeners();
    };
  }, []);

  /* ------------------ Save chat history ------------------ */
  useEffect(() => {
    if (chatHistory.length === 0) {
      AsyncStorage.removeItem(CHAT_HISTORY_KEY);
    } else {
      AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
    }
  }, [chatHistory]);

  /* ------------------ Actions ------------------ */

  const handleSendMessage = async () => {
    if (isLoading) return;

    const text = inputValue.trim();
    if (!text) return;

    if (isListening) {
      const voice = getVoice();
      if (!voice) {
        setIsListening(false);
        speechBaseTextRef.current = "";
        return;
      }

      try {
        await voice.stop();
      } catch (error) {
        console.error("Failed to stop voice recognition before send:", error);
      }
      setIsListening(false);
      speechBaseTextRef.current = "";
    }

    setInputValue("");
    setIsLoading(true);

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text,
        sender: "user",
      },
    ]);

    try {
      const trimmed = chatHistory.slice(-MAX_CHAT_HISTORY);
      const endpoint = SAFE_API_URL;
      console.log("[API] chat request:", endpoint);

      const res = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            k: 3,
            search_type: "similarity",
            chat_history: trimmed,
          }),
        },
        REQUEST_TIMEOUT_MS,
      );

      console.log("[API] chat status:", res.status);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      console.log("[API] response data:", data);

      // Validate response has required fields
      if (!data.answer || typeof data.answer !== "string") {
        console.error(
          "[API] Invalid response format - missing answer field",
          data,
        );
        throw new Error("Invalid API response: missing answer field");
      }

      const chatResponse: ChatResponse = data;

      setChatHistory([
        ...trimmed,
        { role: "user", content: text },
        { role: "assistant", content: chatResponse.answer },
      ]);

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: chatResponse.answer,
          sender: "bot",
        },
      ]);
    } catch (error) {
      console.error("[API] Error sending message:", error);
      const isTimeout =
        error instanceof Error &&
        (error.name === "AbortError" || error.message === "Aborted");
      const errorMessage = isTimeout
        ? "Request timed out. The server is taking too long to respond."
        : error instanceof Error
          ? error.message
          : "Unknown error";
      console.error("[API] Error details:", {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      Alert.alert(
        isTimeout ? "Request Timed Out" : "Connection Error",
        `${errorMessage}\n\nEndpoint: ${SAFE_API_URL}\n\nMake sure the API server is running and accessible.`,
        [{ text: "OK" }],
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = useCallback(async () => {
    try {
      console.log("Clearing chat...");

      await AsyncStorage.removeItem(CHAT_HISTORY_KEY);

      setMessages([]);
      setChatHistory([]);

      console.log("Chat cleared");
    } catch (error) {
      console.error("Clear error:", error);
    }
  }, []);

  const handleMicPress = async () => {
    if (isLoading) return;

    const voice = getVoice();
    if (!voice) {
      Alert.alert(
        "Voice Input Unavailable",
        "Speech recognition is not available in this build. Run a native dev build (expo run:ios / expo run:android) and try again.",
      );
      return;
    }

    if (isListening) {
      try {
        await voice.stop();
      } catch (error) {
        console.error("Failed to stop voice recognition:", error);
      }
      setIsListening(false);
      speechBaseTextRef.current = "";
      return;
    }

    try {
      speechBaseTextRef.current = inputValue.trim()
        ? `${inputValue.trim()} `
        : "";
      await voice.start("en-US");
      setIsListening(true);
    } catch (error) {
      console.error("Failed to start voice recognition:", error);
      Alert.alert(
        "Voice Input Unavailable",
        "Could not start speech recognition. Please check microphone and speech recognition permissions.",
      );
      setIsListening(false);
      speechBaseTextRef.current = "";
    }
  };

  const hasMessages = messages.length > 0;

  const handleScroll = (event: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    };
  }) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    const shouldShow = distanceFromBottom > 100;
    if (shouldShow !== showScrollBtnRef.current) {
      showScrollBtnRef.current = shouldShow;
      setShowScrollBtn(shouldShow);
    }
  };

  /* ------------------ Render ------------------ */

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* ---------- Header ---------- */}
        <View style={styles.header}>
          <Text style={styles.logo}>Buddy</Text>
          <View style={styles.poweredPill}>
            <Text style={styles.poweredText}>Powered by</Text>
            <Text style={styles.opx}>OPX</Text>
            <Text style={styles.ai}>AI</Text>
          </View>
        </View>

        {/* Messages */}
        <View style={styles.messagesOuterContainer}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={[
              styles.messagesContent,
              hasMessages && styles.messagesContentWithMessages,
            ]}
            keyboardShouldPersistTaps="handled"
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {messages.map((message) => (
              <ChatMessageItem key={message.id} message={message} />
            ))}
          </ScrollView>

          {showScrollBtn && (
            <TouchableOpacity
              style={styles.scrollToBottomBtn}
              onPress={() =>
                scrollViewRef.current?.scrollToEnd({ animated: true })
              }
              activeOpacity={0.8}
            >
              <Text style={styles.scrollToBottomBtnText}>↓</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Composer */}
        <View style={styles.composerContainer}>
          <View style={styles.composerWrapper}>
            <View style={styles.inputContainer}>
              <TextInput
                value={inputValue}
                onChangeText={setInputValue}
                multiline
                blurOnSubmit={false}
                placeholder="Message Buddy..."
                placeholderTextColor="#94a3b8"
                style={styles.textInput}
              />

              <TouchableOpacity
                onPress={handleMicPress}
                style={[
                  styles.micButton,
                  isListening && styles.micButtonActive,
                  isListening && styles.micButtonListening,
                ]}
              >
                <Mic size={20} color={isListening ? "#fff" : "#334155"} />
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSendMessage}>
                <Text style={styles.send}>
                  <Send size={16} color="white" strokeWidth={2.5} />
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClearChat}
            >
              <Text>
                <RefreshCw size={18} color="#334155" strokeWidth={3} />
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  logo: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
  },
  poweredPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  poweredText: {
    fontSize: 12,
    color: "#475569",
    marginRight: 4,
  },
  opx: {
    fontSize: 12,
    fontWeight: "800",
    color: "#2563eb",
  },
  ai: {
    fontSize: 12,
    fontWeight: "800",
    color: "#22c55e",
    marginLeft: 2,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  messagesOuterContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
  },
  messagesContentWithMessages: {
    paddingTop: 32,
    paddingBottom: 32,
  },
  messageWrapper: {
    marginBottom: 24,
  },
  messageWrapperUser: {
    alignItems: "flex-end",
  },
  messageWrapperBot: {
    alignItems: "flex-start",
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 16,
    boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.05)",
  },
  messageBubbleUser: {
    backgroundColor: "#e2e8f0",
  },
  messageBubbleBot: {
    backgroundColor: "#ffffff",
    borderLeftWidth: 4,
    borderLeftColor: "#3b82f6",
  },
  messageTextSelectable: {
    fontSize: 14,
    lineHeight: 20,
    padding: 0,
    margin: 0,
  },
  messageTextSelectableUser: {
    color: "#0f172a",
  },
  messageTextSelectableBot: {
    color: "#1e293b",
  },
  scrollToBottomBtn: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    backgroundColor: "#3b82f6",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.2)",
  },
  scrollToBottomBtnText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 24,
  },
  composerContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  composerWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.1)",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: "#0f172a",
    minHeight: 24,
    maxHeight: 144,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 0,
    textAlignVertical: "top",
    includeFontPadding: false,
  },
  micButton: {
    padding: 10,
    borderRadius: 50,
    backgroundColor: "#e2e8f0",
  },
  micButtonListening: {
    transform: [{ scale: 1.1 }],
  },

  micButtonActive: {
    backgroundColor: "#ef4444",
  },

  send: {
    backgroundColor: "#3b82f6",
    color: "#fff",
    paddingTop: 12,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 80,
  },
  clearButton: {
    backgroundColor: "#e2e8f0",
    borderRadius: 80,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
});
