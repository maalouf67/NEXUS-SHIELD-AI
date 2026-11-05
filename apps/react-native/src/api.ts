export type UserRole = "admin" | "analyst" | "viewer";

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
}

export type PhoneVerdict = "malicious" | "suspicious" | "safe" | "unknown";

export interface PhoneReputationResult {
  provider: "ipqualityscore";
  verdict: PhoneVerdict;
  scanned_phone: string;
  fraud_score: number | null;
  number_valid: boolean | null;
  recent_abuse: boolean | null;
  risky: boolean | null;
  spammer: boolean | null;
  active: boolean | null;
  carrier: string | null;
  phone_type: string | null;
  country: string | null;
  region: string | null;
  location: string | null;
  provider_request_id: string | null;
  message: string;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: SessionUser;
}

function getApiBaseUrl(): string {
  const value = process.env.EXPO_PUBLIC_NEXUS_API_URL?.trim().replace(/\/+$/, "");
  if (!value) {
    throw new Error("Set EXPO_PUBLIC_NEXUS_API_URL in the React Native build environment.");
  }
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("The NEXUS API URL must use HTTPS (HTTP is allowed only for local development).");
  }
  return value;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = typeof payload === "object" && payload !== null
      ? payload as { message?: unknown; error?: unknown }
      : {};
    const message = typeof record.message === "string"
      ? record.message
      : typeof record.error === "string"
        ? record.error
        : "The NEXUS API request failed.";
    throw new Error(message);
  }
  return payload as T;
}

export async function signIn(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(getApiBaseUrl() + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    cache: "no-store"
  });
  return parseResponse<LoginResponse>(response);
}

export async function fetchCurrentUser(token: string): Promise<SessionUser> {
  const response = await fetch(getApiBaseUrl() + "/api/auth/me", {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    cache: "no-store"
  });
  const payload = await parseResponse<{ user: SessionUser }>(response);
  return payload.user;
}

export async function checkPhoneReputation(
  token: string,
  phone: string
): Promise<PhoneReputationResult> {
  const response = await fetch(getApiBaseUrl() + "/api/phone-reputation/check", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ phone: phone.trim() }),
    cache: "no-store"
  });
  return parseResponse<PhoneReputationResult>(response);
}
export type SessionRevocationResult = "revoked" | "already-inactive";

/**
 * Ask the API to revoke this short-lived access session. A 401 means the API
 * no longer accepts the token (expired or already revoked). Network/5xx errors
 * are surfaced so the caller does not claim server revocation succeeded.
 */
export async function revokeSession(token: string): Promise<SessionRevocationResult> {
  const response = await fetch(getApiBaseUrl() + "/api/auth/logout", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    cache: "no-store"
  });

  if (response.status === 204) return "revoked";
  if (response.status === 401) return "already-inactive";
  if (response.ok) throw new Error("The NEXUS API returned an unexpected logout response.");
  await parseResponse<never>(response);
  throw new Error("The NEXUS API logout request failed.");
}
