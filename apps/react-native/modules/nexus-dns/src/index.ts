import { requireNativeModule } from "expo-modules-core";

export interface NexusDNSStatus {
  enabled: boolean;
  configured: boolean;
  resolver: string;
  serverName: string;
  protocol: "DNS-over-TLS";
  requiresUserApproval: boolean;
}

interface NexusDNSNativeModule {
  enable(): Promise<NexusDNSStatus>;
  disable(): Promise<{ enabled: boolean; removed: boolean }>;
  status(): Promise<NexusDNSStatus>;
}

export default requireNativeModule<NexusDNSNativeModule>("NexusDNS");