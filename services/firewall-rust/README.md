# NEXUS SHIELD AI — Rust Firewall Policy Core

This component adds a Rust policy-validation and nftables preview core for Linux host/server ingress protection.

## Why Rust
Rust provides memory safety without a garbage collector and strong compile-time checks. Linux kernel nftables performs packet filtering; this package validates policies and renders candidate rules.

## Current scope
- Validate allowed TCP ports and denied IPv4/IPv6 CIDR sources.
- Reject duplicate ports/networks and malformed CIDR values.
- Generate an nftables inet table with loopback and established/related allowances, source-deny rules, explicit TCP allow ports, and default-drop ingress.
- CLI preview from JSON and unit tests.

## Safety boundary
- Does not execute nft, invoke a shell, alter host networking, install a service, or apply rules.
- A default-drop ruleset can lock out SSH, management, health probes, or other services if the allow-list is incomplete. Review against host requirements and recovery access.
- Test only in a disposable VM/container with console access and rollback plan. Production apply requires operator approval and a separately reviewed integration.
- Server firewall groundwork only; not an Android VPN firewall, endpoint agent, full IDS/IPS signature engine, or evidence of production protection.

## Build and test
~~~sh
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
~~~

## Example policy
~~~json
{
  "allowed_tcp_ports": [22, 443],
  "denied_sources": ["192.0.2.0/24", "2001:db8::/32"]
}
~~~

Preview with:
~~~sh
cargo run -- --policy policy.json
~~~
