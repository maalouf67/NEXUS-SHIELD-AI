//! NEXUS SHIELD AI firewall policy and network behavior engine.
//!
//! This crate consumes normalized flow observations from a trusted sensor.
//! It does not capture packets, sniff interfaces, execute nft, or apply rules.

use chrono::{DateTime, SecondsFormat, Utc};
use ipnet::IpNet;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};
use std::net::IpAddr;
use uuid::Uuid;

pub mod soc;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FirewallPolicy {
    pub allowed_tcp_ports: Vec<u16>,
    pub denied_sources: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyError {
    InvalidCidr(String),
    DuplicatePort(u16),
    DuplicateNetwork(String),
    TooManyPorts,
    TooManyNetworks,
    InvalidPort(u16),
}

impl std::fmt::Display for PolicyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidCidr(value) => write!(f, "invalid CIDR network: {value}"),
            Self::DuplicatePort(port) => write!(f, "duplicate allowed TCP port: {port}"),
            Self::DuplicateNetwork(network) => write!(f, "duplicate denied network: {network}"),
            Self::TooManyPorts => write!(f, "at most 256 TCP ports may be allowed"),
            Self::TooManyNetworks => write!(f, "at most 1024 denied networks may be configured"),
            Self::InvalidPort(port) => write!(f, "port 0 is not a valid allow-list entry: {port}"),
        }
    }
}
impl std::error::Error for PolicyError {}

impl FirewallPolicy {
    pub fn validate(&self) -> Result<Vec<IpNet>, PolicyError> {
        if self.allowed_tcp_ports.len() > 256 {
            return Err(PolicyError::TooManyPorts);
        }
        if self.denied_sources.len() > 1024 {
            return Err(PolicyError::TooManyNetworks);
        }

        let mut ports = BTreeSet::new();
        for port in &self.allowed_tcp_ports {
            if *port == 0 {
                return Err(PolicyError::InvalidPort(*port));
            }
            if !ports.insert(*port) {
                return Err(PolicyError::DuplicatePort(*port));
            }
        }

        let mut networks = BTreeSet::new();
        let mut parsed = Vec::with_capacity(self.denied_sources.len());
        for source in &self.denied_sources {
            let network = source.parse::<IpNet>()
                .map_err(|_| PolicyError::InvalidCidr(source.clone()))?;
            let canonical = network.to_string();
            if !networks.insert(canonical.clone()) {
                return Err(PolicyError::DuplicateNetwork(canonical));
            }
            parsed.push(network);
        }
        Ok(parsed)
    }

    /// Render candidate nftables config only. The caller must review and apply explicitly.
    pub fn render_nftables(&self) -> Result<String, PolicyError> {
        let networks = self.validate()?;
        let mut output = String::from(
            "table inet nexus_shield {\n chain input {\n  type filter hook input priority 0; policy drop;\n  iifname \"lo\" accept\n  ct state established,related accept\n"
        );
        for network in networks {
            match network {
                IpNet::V4(_) => output.push_str(&format!("  ip saddr {network} drop\n")),
                IpNet::V6(_) => output.push_str(&format!("  ip6 saddr {network} drop\n")),
            }
        }
        for port in &self.allowed_tcp_ports {
            output.push_str(&format!("  tcp dport {port} ct state new accept\n"));
        }
        output.push_str(" }\n}\n");
        Ok(output)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "lowercase")]
pub enum NetworkProtocol {
    Tcp,
    Udp,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FlowAction {
    Allowed,
    Blocked,
}

/// Normalized observation. observed_at_unix is seconds since the Unix epoch.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct FlowObservation {
    pub observed_at_unix: u64,
    pub source_ip: String,
    pub destination_port: u16,
    pub protocol: NetworkProtocol,
    pub action: FlowAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SecurityEventInput {
    pub source: String,
    pub external_event_id: String,
    pub event_type: String,
    pub severity: String,
    pub observed_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_id: Option<String>,
    pub summary: String,
    pub attributes: BTreeMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct NetworkBehaviorConfig {
    pub window_seconds: u64,
    pub port_scan_distinct_ports: usize,
    pub connection_burst_count: usize,
    pub blocked_attempt_count: usize,
    pub alert_cooldown_seconds: u64,
    pub max_tracked_sources: usize,
    pub max_observations_per_source: usize,
}

impl Default for NetworkBehaviorConfig {
    fn default() -> Self {
        Self {
            window_seconds: 60,
            port_scan_distinct_ports: 12,
            connection_burst_count: 100,
            blocked_attempt_count: 15,
            alert_cooldown_seconds: 300,
            max_tracked_sources: 4096,
            max_observations_per_source: 10_000,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DetectionError {
    InvalidSourceIp(String),
    InvalidDestinationPort,
    TimestampOutOfRange,
    FutureTimestamp,
    OutOfOrderObservation,
    CapacityExceeded,
    InvalidConfiguration,
}

impl std::fmt::Display for DetectionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidSourceIp(ip) => write!(f, "invalid source IP address: {ip}"),
            Self::InvalidDestinationPort => write!(f, "destination port must be between 1 and 65535"),
            Self::TimestampOutOfRange => write!(f, "observation timestamp is outside supported range"),
            Self::FutureTimestamp => write!(f, "observation timestamp is more than five minutes in the future"),
            Self::OutOfOrderObservation => write!(f, "source observations must arrive in nondecreasing event-time order"),
            Self::CapacityExceeded => write!(f, "network behavior detector capacity limit exceeded"),
            Self::InvalidConfiguration => write!(f, "network behavior detector configuration is invalid"),
        }
    }
}
impl std::error::Error for DetectionError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum DetectionKind {
    PortScan,
    ConnectionBurst,
    RepeatedBlockedProbes,
}

impl DetectionKind {
    fn event_type(self) -> &'static str {
        match self {
            Self::PortScan => "network.port_scan_suspected",
            Self::ConnectionBurst => "network.connection_burst_suspected",
            Self::RepeatedBlockedProbes => "network.repeated_blocked_probes",
        }
    }

    fn severity(self) -> &'static str {
        match self {
            Self::PortScan => "high",
            Self::ConnectionBurst => "medium",
            Self::RepeatedBlockedProbes => "medium",
        }
    }
}

/// Bounded, event-time sliding-window heuristic detector. It produces alerts only;
/// it never blocks a source or changes network policy automatically.
pub struct NetworkBehaviorDetector {
    config: NetworkBehaviorConfig,
    windows: HashMap<IpAddr, VecDeque<FlowObservation>>,
    last_emitted: HashMap<(IpAddr, DetectionKind), u64>,
}

impl NetworkBehaviorDetector {
    pub fn new(config: NetworkBehaviorConfig) -> Result<Self, DetectionError> {
        if config.window_seconds == 0
            || config.window_seconds > 300
            || config.port_scan_distinct_ports < 2
            || config.connection_burst_count == 0
            || config.blocked_attempt_count == 0
            || config.alert_cooldown_seconds == 0
            || config.max_tracked_sources == 0
            || config.max_observations_per_source == 0
        {
            return Err(DetectionError::InvalidConfiguration);
        }
        Ok(Self {
            config,
            windows: HashMap::new(),
            last_emitted: HashMap::new(),
        })
    }

    pub fn observe(&mut self, observation: FlowObservation) -> Result<Vec<SecurityEventInput>, DetectionError> {
        let source_ip = observation.source_ip.parse::<IpAddr>()
            .map_err(|_| DetectionError::InvalidSourceIp(observation.source_ip.clone()))?;
        if observation.destination_port == 0 {
            return Err(DetectionError::InvalidDestinationPort);
        }
        let observed_at = observation.observed_at_unix;
        if observed_at > i64::MAX as u64 {
            return Err(DetectionError::TimestampOutOfRange);
        }
        let now = u64::try_from(Utc::now().timestamp()).unwrap_or(0);
        if observed_at > now.saturating_add(300) {
            return Err(DetectionError::FutureTimestamp);
        }

        if let Some(existing) = self.windows.get(&source_ip) {
            if existing.back().is_some_and(|last| last.observed_at_unix > observed_at) {
                return Err(DetectionError::OutOfOrderObservation);
            }
        }

        let window_seconds = self.config.window_seconds;
        self.windows.retain(|_, values| {
            values.back().is_some_and(|last| last.observed_at_unix.saturating_add(window_seconds) >= observed_at)
        });
        self.last_emitted.retain(|_, last| {
            last.saturating_add(self.config.alert_cooldown_seconds) >= observed_at
        });

        if !self.windows.contains_key(&source_ip) && self.windows.len() >= self.config.max_tracked_sources {
            return Err(DetectionError::CapacityExceeded);
        }

        let values = self.windows.entry(source_ip).or_default();
        while values.front().is_some_and(|first| {
            first.observed_at_unix.saturating_add(window_seconds) < observed_at
        }) {
            values.pop_front();
        }
        if values.len() >= self.config.max_observations_per_source {
            return Err(DetectionError::CapacityExceeded);
        }
        values.push_back(observation);

        let distinct_ports: BTreeSet<(NetworkProtocol, u16)> = values
            .iter()
            .map(|item| (item.protocol, item.destination_port))
            .collect();
        let blocked_count = values.iter()
            .filter(|item| item.action == FlowAction::Blocked)
            .count();
        let observation_count = values.len();

        let mut candidates = Vec::new();
        if distinct_ports.len() >= self.config.port_scan_distinct_ports {
            candidates.push((DetectionKind::PortScan, distinct_ports.len(), blocked_count));
        }
        if observation_count >= self.config.connection_burst_count {
            candidates.push((DetectionKind::ConnectionBurst, distinct_ports.len(), blocked_count));
        }
        if blocked_count >= self.config.blocked_attempt_count {
            candidates.push((DetectionKind::RepeatedBlockedProbes, distinct_ports.len(), blocked_count));
        }

        let mut emitted = Vec::new();
        for (kind, port_count, blocked) in candidates {
            let key = (source_ip, kind);
            let suppressed = self.last_emitted.get(&key).is_some_and(|last| {
                observed_at.saturating_sub(*last) < self.config.alert_cooldown_seconds
            });
            if suppressed {
                continue;
            }
            self.last_emitted.insert(key, observed_at);
            let observed = DateTime::<Utc>::from_timestamp(observed_at as i64, 0)
                .ok_or(DetectionError::TimestampOutOfRange)?;
            let mut attributes = BTreeMap::new();
            attributes.insert("source_ip".into(), source_ip.to_string());
            attributes.insert("window_seconds".into(), window_seconds.to_string());
            attributes.insert("observation_count".into(), observation_count.to_string());
            attributes.insert("distinct_destination_ports".into(), port_count.to_string());
            attributes.insert("blocked_observations".into(), blocked.to_string());
            attributes.insert("detection_engine".into(), "nexus-rust-firewall".into());
            emitted.push(SecurityEventInput {
                source: "nexus-rust-firewall".into(),
                external_event_id: Uuid::new_v5(\n                    &Uuid::NAMESPACE_OID,\n                    format!("nexus-firewall:v1:{source_ip}:{}:{observed_at}", kind.event_type()).as_bytes(),\n                ).to_string(),
                event_type: kind.event_type().into(),
                severity: kind.severity().into(),
                observed_at: observed.to_rfc3339_opts(SecondsFormat::Millis, true),
                asset_id: None,
                summary: format!(
                    "{} detected within a {} second observation window",
                    kind.event_type().replace('.', " "),
                    window_seconds
                ),
                attributes,
            });
        }
        Ok(emitted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flow(at: u64, port: u16, action: FlowAction) -> FlowObservation {
        FlowObservation {
            observed_at_unix: at,
            source_ip: "198.51.100.27".into(),
            destination_port: port,
            protocol: NetworkProtocol::Tcp,
            action,
        }
    }

    #[test]
    fn renders_default_deny_and_baseline_rules() {
        let policy = FirewallPolicy {
            allowed_tcp_ports: vec![443, 22],
            denied_sources: vec!["192.0.2.0/24".into(), "2001:db8::/32".into()],
        };
        let rules = policy.render_nftables().unwrap();
        assert!(rules.contains("policy drop"));
        assert!(rules.contains("iifname \"lo\" accept"));
        assert!(rules.contains("ct state established,related accept"));
        assert!(rules.contains("ip saddr 192.0.2.0/24 drop"));
        assert!(rules.contains("ip6 saddr 2001:db8::/32 drop"));
        assert!(rules.contains("tcp dport 443 ct state new accept"));
    }

    #[test]
    fn rejects_duplicate_ports_and_invalid_cidr() {
        let duplicate = FirewallPolicy { allowed_tcp_ports: vec![443, 443], denied_sources: vec![] };
        assert_eq!(duplicate.validate(), Err(PolicyError::DuplicatePort(443)));
        let invalid = FirewallPolicy { allowed_tcp_ports: vec![], denied_sources: vec!["not-a-network".into()] };
        assert_eq!(invalid.validate(), Err(PolicyError::InvalidCidr("not-a-network".into())));
    }

    #[test]
    fn rejects_duplicate_networks_and_zero_port() {
        let duplicate = FirewallPolicy {
            allowed_tcp_ports: vec![],
            denied_sources: vec!["192.0.2.0/24".into(), "192.0.2.0/24".into()],
        };
        assert_eq!(duplicate.validate(), Err(PolicyError::DuplicateNetwork("192.0.2.0/24".into())));
        let zero = FirewallPolicy { allowed_tcp_ports: vec![0], denied_sources: vec![] };
        assert_eq!(zero.validate(), Err(PolicyError::InvalidPort(0)));
    }

    #[test]
    fn detects_port_scan_and_suppresses_repeated_alerts_during_cooldown() {
        let mut detector = NetworkBehaviorDetector::new(NetworkBehaviorConfig::default()).unwrap();
        let mut events = Vec::new();
        for index in 0..13 {
            events.extend(detector.observe(flow(1_700_000_000 + index, 1000 + index as u16, FlowAction::Allowed)).unwrap());
        }
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "network.port_scan_suspected");
        assert_eq!(events[0].severity, "high");
        assert_eq!(events[0].attributes["distinct_destination_ports"], "12");
        let next = detector.observe(flow(1_700_000_020, 3000, FlowAction::Allowed)).unwrap();
        assert!(next.is_empty());
    }

    #[test]
    fn detects_repeated_blocked_probes() {
        let mut detector = NetworkBehaviorDetector::new(NetworkBehaviorConfig::default()).unwrap();
        let mut events = Vec::new();
        for index in 0..15 {
            events.extend(detector.observe(flow(1_700_000_000 + index, 443, FlowAction::Blocked)).unwrap());
        }
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "network.repeated_blocked_probes");
        assert_eq!(events[0].severity, "medium");
    }

    #[test]
    fn detects_connection_burst_using_configured_threshold() {
        let config = NetworkBehaviorConfig {
            connection_burst_count: 3,
            port_scan_distinct_ports: 20,
            blocked_attempt_count: 20,
            ..NetworkBehaviorConfig::default()
        };
        let mut detector = NetworkBehaviorDetector::new(config).unwrap();
        let mut events = Vec::new();
        for index in 0..3 {
            events.extend(detector.observe(flow(1_700_000_000 + index, 443, FlowAction::Allowed)).unwrap());
        }
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "network.connection_burst_suspected");
    }

    #[test]
    fn rejects_invalid_and_out_of_order_observations() {
        let mut detector = NetworkBehaviorDetector::new(NetworkBehaviorConfig::default()).unwrap();
        let mut invalid = flow(1_700_000_000, 443, FlowAction::Allowed);
        invalid.source_ip = "not-an-ip".into();
        assert_eq!(detector.observe(invalid), Err(DetectionError::InvalidSourceIp("not-an-ip".into())));
        assert!(detector.observe(flow(1_700_000_010, 443, FlowAction::Allowed)).unwrap().is_empty());
        assert_eq!(detector.observe(flow(1_700_000_009, 444, FlowAction::Allowed)), Err(DetectionError::OutOfOrderObservation));
    }

    #[test]
    fn rejects_far_future_timestamps() {
        let mut detector = NetworkBehaviorDetector::new(NetworkBehaviorConfig::default()).unwrap();
        let future = u64::try_from(Utc::now().timestamp()).unwrap() + 600;
        assert_eq!(detector.observe(flow(future, 443, FlowAction::Allowed)), Err(DetectionError::FutureTimestamp));
    }
}
