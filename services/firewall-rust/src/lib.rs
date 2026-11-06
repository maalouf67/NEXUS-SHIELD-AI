//! Deterministic firewall policy validation and nftables preview.
//! No privileged commands are executed and no host rules are applied.

use ipnet::IpNet;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

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
}

impl std::fmt::Display for PolicyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidCidr(value) => write!(f, "invalid CIDR network: {value}"),
            Self::DuplicatePort(port) => write!(f, "duplicate allowed TCP port: {port}"),
            Self::DuplicateNetwork(network) => write!(f, "duplicate denied network: {network}"),
        }
    }
}
impl std::error::Error for PolicyError {}

impl FirewallPolicy {
    pub fn validate(&self) -> Result<Vec<IpNet>, PolicyError> {
        let mut ports = BTreeSet::new();
        for port in &self.allowed_tcp_ports {
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

#[cfg(test)]
mod tests {
    use super::*;

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
    fn rejects_duplicate_ports() {
        let policy = FirewallPolicy { allowed_tcp_ports: vec![443, 443], denied_sources: vec![] };
        assert_eq!(policy.validate(), Err(PolicyError::DuplicatePort(443)));
    }

    #[test]
    fn rejects_invalid_cidr() {
        let policy = FirewallPolicy { allowed_tcp_ports: vec![], denied_sources: vec!["not-a-network".into()] };
        assert_eq!(policy.validate(), Err(PolicyError::InvalidCidr("not-a-network".into())));
    }

    #[test]
    fn rejects_duplicate_networks() {
        let policy = FirewallPolicy { allowed_tcp_ports: vec![], denied_sources: vec!["192.0.2.0/24".into(), "192.0.2.0/24".into()] };
        assert_eq!(policy.validate(), Err(PolicyError::DuplicateNetwork("192.0.2.0/24".into())));
    }
}
