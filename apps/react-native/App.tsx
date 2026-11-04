import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as SecureStore from "expo-secure-store";

import {
  checkPhoneReputation,
  fetchCurrentUser,
  signIn,
  type PhoneReputationResult,
  type SessionUser
} from "./src/api";
import NexusDNS from "./src/native/nexusDns";

const TOKEN_KEY = "nexus_access_token";
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

function ActionButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.button,
        props.secondary ? styles.secondaryButton : styles.primaryButton,
        (props.disabled || pressed) && styles.buttonDisabled
      ]}
    >
      <Text style={styles.buttonText}>{props.label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("+212");
  const [result, setResult] = useState<PhoneReputationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dnsStatus, setDnsStatus] = useState("Not checked");

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (saved) {
          const currentUser = await fetchCurrentUser(saved);
          if (active) {
            setToken(saved);
            setUser(currentUser);
          }
        }
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
      } finally {
        if (active) setReady(true);
      }
    }
    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await signIn(email, password);
      await SecureStore.setItemAsync(TOKEN_KEY, response.access_token, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
      });
      setToken(response.access_token);
      setUser(response.user);
      setPassword("");
      setNotice("Signed in. Your short-lived access token is stored in device secure storage.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
    setToken(null);
    setUser(null);
    setResult(null);
    setNotice("Signed out.");
  }

  async function handlePhoneCheck() {
    if (!token || !E164_PATTERN.test(phone.trim())) {
      setError("Enter a valid international phone number, such as +212612345678.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setNotice("");
    try {
      setResult(await checkPhoneReputation(token, phone));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Phone reputation lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDnsEnable() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const status = await NexusDNS.enable();
      if (status.protocol === "unsupported") {
        setDnsStatus("Use the native Android companion for Android DNS protection.");
        return;
      }
      setDnsStatus(status.enabled ? "Enabled" : "Configured; user approval may be required in iOS Settings");
      setNotice("DNS-over-TLS settings were saved. Open iOS Settings and enable the NEXUS DNS configuration before it becomes active.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not configure iOS DNS protection.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDnsDisable() {
    setBusy(true);
    setError("");
    try {
      const status = await NexusDNS.disable();
      setDnsStatus(status.removed ? "Disabled" : "Not available in this build");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the DNS configuration.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDnsStatus() {
    try {
      const status = await NexusDNS.status();
      if (status.protocol === "unsupported") setDnsStatus("Use the native Android companion for Android DNS protection.");
      else setDnsStatus(status.enabled ? "Enabled" : status.configured ? "Configured; awaiting user approval" : "Off");
    } catch {
      setDnsStatus("Status unavailable");
    }
  }

  if (!ready) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#63d9ed" />
        <Text style={styles.muted}>Restoring secure session…</Text>
      </SafeAreaView>
    );
  }

  if (!user || !token) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={styles.brand}>◈ NEXUS SHIELD AI</Text>
          <Text style={styles.kicker}>SECURITY OPERATIONS</Text>
          <Text style={styles.heading}>Sign in securely</Text>
          <Text style={styles.muted}>Connect this mobile app to your configured NEXUS API.</Text>
          <Text style={styles.label}>Work email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            placeholder="name@company.com"
            placeholderTextColor="#71849a"
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your account password"
            placeholderTextColor="#71849a"
          />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <ActionButton label={busy ? "Signing in…" : "Sign in"} onPress={() => void handleLogin()} disabled={busy || !email.trim() || !password} />
          <Text style={styles.footnote}>Set EXPO_PUBLIC_NEXUS_API_URL in the build environment. Use HTTPS for deployed environments.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const canScan = user.role === "admin" || user.role === "analyst";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>◈ NEXUS SHIELD AI</Text>
            <Text style={styles.muted}>{user.email} · {user.role}</Text>
          </View>
          <ActionButton label="Sign out" onPress={() => void handleSignOut()} secondary />
        </View>

        <Text style={styles.kicker}>MOBILE SECURITY CONSOLE</Text>
        <Text style={styles.heading}>Phone reputation</Text>
        <Text style={styles.muted}>Authenticated lookups through the NEXUS API and its configured provider.</Text>
        {canScan ? (
          <>
            <Text style={styles.label}>International phone number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="+212612345678"
              placeholderTextColor="#71849a"
            />
            <ActionButton label={busy ? "Checking…" : "Check phone reputation"} onPress={() => void handlePhoneCheck()} disabled={busy || !E164_PATTERN.test(phone.trim())} />
          </>
        ) : (
          <Text style={styles.warning}>Viewer accounts are read-only. An Admin or Analyst is required for phone reputation checks.</Text>
        )}

        {result ? (
          <View style={styles.card}>
            <Text style={styles.kicker}>IPQUALITYSCORE RESULT</Text>
            <Text style={styles.resultTitle}>{result.verdict.toUpperCase()}</Text>
            <Text style={styles.body}>{result.message}</Text>
            <Text style={styles.body}>Number: {result.scanned_phone}</Text>
            <Text style={styles.body}>Fraud score: {result.fraud_score === null ? "Not supplied" : result.fraud_score + " / 100"}</Text>
            <Text style={styles.body}>Carrier: {result.carrier ?? "Not supplied"}</Text>
            <Text style={styles.body}>Line type: {result.phone_type ?? "Not supplied"}</Text>
            <Text style={styles.body}>Country: {result.country ?? "Not supplied"}</Text>
            <Text style={styles.warning}>A reputation signal is not proof of caller identity. UNKNOWN is not SAFE.</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.kicker}>IOS NETWORK EXTENSION DNS SETTINGS</Text>
          <Text style={styles.sectionTitle}>Encrypted DNS protection</Text>
          <Text style={styles.body}>Resolver: Quad9 9.9.9.9 · DNS-over-TLS · dns.quad9.net</Text>
          <Text style={styles.body}>Current status: {dnsStatus}</Text>
          <ActionButton label="Check DNS status" onPress={() => void refreshDnsStatus()} secondary disabled={busy} />
          <ActionButton label="Configure DNS protection" onPress={() => void handleDnsEnable()} disabled={busy} />
          <ActionButton label="Remove DNS configuration" onPress={() => void handleDnsDisable()} secondary disabled={busy} />
          <Text style={styles.warning}>iOS requires the user to approve and enable its DNS configuration. This is encrypted system DNS, not a full-packet VPN. Android DNS protection remains in the native apps/android companion.</Text>
        </View>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Text style={styles.footnote}>Development build · API responses are displayed as returned · No phone lookup history is stored by this app.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#06111e" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#06111e", gap: 12 },
  page: { padding: 22, paddingBottom: 50, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 },
  brand: { color: "#6ee2f1", fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  kicker: { color: "#6b91b4", fontSize: 10, fontWeight: "800", letterSpacing: 2, marginTop: 14 },
  heading: { color: "#eff6ff", fontSize: 28, fontWeight: "800", marginTop: 6 },
  sectionTitle: { color: "#e8f1fb", fontSize: 18, fontWeight: "700" },
  muted: { color: "#9bafc4", fontSize: 12, lineHeight: 19 },
  label: { color: "#c1d2e4", fontSize: 12, fontWeight: "700", marginTop: 12 },
  input: { backgroundColor: "#0e2032", color: "#f4f8fd", borderColor: "#25425d", borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 14 },
  button: { minHeight: 46, justifyContent: "center", alignItems: "center", borderRadius: 10, paddingHorizontal: 15, marginTop: 8 },
  primaryButton: { backgroundColor: "#13768a" },
  secondaryButton: { backgroundColor: "#1b2b3c", borderColor: "#304b65", borderWidth: 1 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#f4fbff", fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: "#0c1c2c", borderColor: "#1d344b", borderWidth: 1, padding: 16, borderRadius: 14, marginTop: 18, gap: 10 },
  resultTitle: { color: "#7ee2c3", fontSize: 22, fontWeight: "900" },
  body: { color: "#c2d0de", fontSize: 12, lineHeight: 19 },
  warning: { color: "#f5c98f", backgroundColor: "#2b241a", padding: 12, borderRadius: 9, fontSize: 11, lineHeight: 17, marginTop: 10 },
  error: { color: "#ffc0c8", backgroundColor: "#3b1d28", padding: 12, borderRadius: 9, fontSize: 12, marginTop: 10 },
  notice: { color: "#91e2ca", backgroundColor: "#102c2a", padding: 12, borderRadius: 9, fontSize: 12, marginTop: 10 },
  footnote: { color: "#758ba2", fontSize: 10, lineHeight: 16, marginTop: 20 }
});