use nexus_firewall::{soc::SocClient, SecurityEventInput};
use serde_json::Value;
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
    time::Duration,
};

#[test]
fn posts_normalized_event_to_the_existing_soc_contract() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        let mut buffer = Vec::new();
        let mut chunk = [0_u8; 4096];
        let mut header_end = None;
        let mut content_length = 0usize;

        loop {
            let count = stream.read(&mut chunk).unwrap();
            assert!(count > 0, "client closed before sending the complete request");
            buffer.extend_from_slice(&chunk[..count]);

            if header_end.is_none() {
                if let Some(position) = buffer.windows(4).position(|part| part == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&buffer[..position]);
                    assert!(header.starts_with("POST /api/integrations/security-events HTTP/1.1"));
                    assert!(header.lines().any(|line| line.eq_ignore_ascii_case(
                        "X-NEXUS-INGESTION-TOKEN: nexus-isolated-test-ingestion-token-123456"
                    )));
                    content_length = header.lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse::<usize>().unwrap())
                        })
                        .expect("Content-Length header is required");
                    header_end = Some(position + 4);
                }
            }

            if header_end.is_some_and(|end| buffer.len() >= end + content_length) {
                break;
            }
        }

        let body_start = header_end.unwrap();
        let payload: Value = serde_json::from_slice(&buffer[body_start..body_start + content_length]).unwrap();
        let event = &payload["events"][0];
        assert_eq!(event["source"], "nexus-rust-firewall");
        assert_eq!(event["eventType"], "network.port_scan_suspected");
        assert_eq!(event["severity"], "high");
        assert_eq!(event["attributes"]["source_ip"], "198.51.100.27");

        stream.write_all(
            b"HTTP/1.1 202 Accepted\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}"
        ).unwrap();
    });

    let event = SecurityEventInput {
        source: "nexus-rust-firewall".into(),
        external_event_id: "00000000-0000-4000-8000-000000000001".into(),
        event_type: "network.port_scan_suspected".into(),
        severity: "high".into(),
        observed_at: "2026-11-06T12:00:00.000Z".into(),
        asset_id: None,
        summary: "Synthetic port scan behavior".into(),
        attributes: [
            ("source_ip".into(), "198.51.100.27".into()),
            ("distinct_destination_ports".into(), "12".into()),
        ].into_iter().collect(),
    };

    let client = SocClient::new(
        &format!("http://{address}"),
        "nexus-isolated-test-ingestion-token-123456".into(),
    ).unwrap();
    assert_eq!(client.ingest_events(&[event]).unwrap(), 1);
    server.join().unwrap();
}

#[test]
fn refuses_plain_http_to_non_loopback_soc_hosts() {
    let result = SocClient::new(
        "http://192.0.2.10",
        "nexus-isolated-test-ingestion-token-123456".into(),
    );
    assert!(result.is_err());
}
