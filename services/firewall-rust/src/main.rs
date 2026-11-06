use nexus_firewall::FirewallPolicy;
use std::{env, fs, process};

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 || args[1] != "--policy" {
        eprintln!("Usage: nexus-firewall --policy <policy.json>");
        eprintln!("Outputs candidate nftables rules; does not apply them.");
        process::exit(2);
    }
    let raw = fs::read_to_string(&args[2]).unwrap_or_else(|error| {
        eprintln!("Unable to read policy file: {error}");
        process::exit(2);
    });
    let policy: FirewallPolicy = serde_json::from_str(&raw).unwrap_or_else(|error| {
        eprintln!("Invalid policy JSON: {error}");
        process::exit(2);
    });
    let ruleset = policy.render_nftables().unwrap_or_else(|error| {
        eprintln!("Policy validation failed: {error}");
        process::exit(2);
    });
    print!("{ruleset}");
}
