use nexus_firewall::{
    FlowObservation, NetworkBehaviorConfig, NetworkBehaviorDetector, SecurityEventInput,
};
use nexus_firewall::soc::SocClient;
use serde::Serialize;
use std::{
    env,
    fs::File,
    io::{self, BufRead, BufReader},
    path::PathBuf,
    process,
};

#[derive(Serialize)]
struct PreviewBatch<'a> {
    observations_processed: usize,
    events: &'a [SecurityEventInput],
}

fn usage() {
    eprintln!("Usage: nexus-firewall --input <flows.jsonl|-> [--soc-url <https://api-host> | --stdout-only]");
    eprintln!("Input is normalized JSONL from a trusted sensor. No packet capture or host changes occur.");
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let mut input: Option<String> = None;
    let mut soc_url: Option<String> = None;
    let mut stdout_only = false;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--input" => input = args.next(),
            "--soc-url" => soc_url = args.next(),
            "--stdout-only" => stdout_only = true,
            "--help" | "-h" => {
                usage();
                return Ok(());
            }
            _ => return Err(format!("unknown argument: {arg}")),
        }
    }

    let input = input.ok_or_else(|| "missing --input".to_string())?;
    if stdout_only && soc_url.is_some() {
        return Err("choose either --stdout-only or SOC forwarding, not both".into());
    }
    let soc_url = if stdout_only {
        None
    } else {
        soc_url.or_else(|| env::var("NEXUS_SOC_API_URL").ok())
    };

    let reader: Box<dyn BufRead> = if input == "-" {
        Box::new(BufReader::new(io::stdin()))
    } else {
        let path = PathBuf::from(input);
        let file = File::open(&path).map_err(|error| format!("cannot open input: {error}"))?;
        Box::new(BufReader::new(file))
    };

    let mut detector = NetworkBehaviorDetector::new(NetworkBehaviorConfig::default())
        .map_err(|error| error.to_string())?;
    let mut events = Vec::new();
    let mut observations_processed = 0usize;

    for (line_index, line) in reader.lines().enumerate() {
        let line = line.map_err(|error| format!("failed reading JSONL: {error}"))?;
        if line.trim().is_empty() {
            continue;
        }
        if line.len() > 16 * 1024 {
            return Err(format!("line {} exceeds 16 KiB", line_index + 1));
        }
        observations_processed += 1;
        if observations_processed > 100_000 {
            return Err("input exceeds the 100000 observation safety limit".into());
        }
        let observation: FlowObservation = serde_json::from_str(&line)
            .map_err(|error| format!("invalid observation on line {}: {error}", line_index + 1))?;
        let mut emitted = detector.observe(observation)
            .map_err(|error| format!("invalid observation on line {}: {error}", line_index + 1))?;
        events.append(&mut emitted);
        if events.len() > 10_000 {
            return Err("detector exceeded the 10000 event safety limit".into());
        }
    }

    if let Some(base_url) = soc_url {
        if events.is_empty() {
            println!("No suspicious behavior crossed the configured thresholds; no SOC event was sent.");
            return Ok(());
        }
        let token = env::var("NEXUS_EVENT_INGESTION_TOKEN")
            .map_err(|_| "NEXUS_EVENT_INGESTION_TOKEN is required for SOC forwarding".to_string())?;
        let client = SocClient::new(&base_url, token).map_err(|error| error.to_string())?;
        let accepted = client.ingest_events(&events).map_err(|error| error.to_string())?;
        println!("Processed {observations_processed} observations; SOC accepted {accepted} security events.");
    } else {
        let preview = PreviewBatch {
            observations_processed,
            events: &events,
        };
        let output = serde_json::to_string_pretty(&preview)
            .map_err(|error| format!("could not serialize preview: {error}"))?;
        println!("{output}");
    }
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("nexus-firewall: {error}");
        usage();
        process::exit(2);
    }
}
