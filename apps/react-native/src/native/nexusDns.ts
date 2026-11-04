export interface NexusDNSStatus {
  enabled: boolean;
  configured: boolean;
  resolver: string;
  serverName: string;
  protocol: "DNS-over-TLS" | "unsupported";
  requiresUserApproval: boolean;
}

const unsupportedStatus: NexusDNSStatus = {
  enabled: false,
  configured: false,
  resolver: "9.9.9.9",
  serverName: "dns.quad9.net",
  protocol: "unsupported",
  requiresUserApproval: false
};

// The React Native Android build continues to use the existing native Android
// companion in apps/android. This local native module is iOS-only.
export default {
  async enable(): Promise<NexusDNSStatus> {
    return unsupportedStatus;
  },
  async disable(): Promise<{ enabled: boolean; removed: boolean }> {
    return { enabled: false, removed: false };
  },
  async status(): Promise<NexusDNSStatus> {
    return unsupportedStatus;
  }
};