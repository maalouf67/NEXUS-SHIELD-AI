use crate::SecurityEventInput;
use hmac::{Hmac, Mac};
use reqwest::blocking::Client;
use reqwest::{header::HeaderValue, StatusCode};
use sha2::Sha256;
use std::{net::IpAddr, thread, time::Duration};
use url::Url;

type HmacSha256 = Hmac<Sha256>;

const INGEST_PATH: &str = "/api/integrations/security-events";
const MAX_BATCH_SIZE: usize = 100;

#[derive(Debug)]
pub enum SocError {
    InvalidUrl(String),
    InsecureRemoteUrl,
    InvalidToken,
    InvalidFingerprintKey,
    HttpClient(String),
    Transport(String),
    Rejected(StatusCode),
    InvalidBatch,
}

impl std::fmt::Display for SocError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidUrl(error) => write!(f, "invalid SOC base URL: {error}"),
            Self::InsecureRemoteUrl => write!(f, "SOC URL must use HTTPS unless it targets localhost for an isolated test"),
            Self::InvalidToken => write!(f, "SOC ingestion token must contain at least 32 non-whitespace characters"),
            Self::InvalidFingerprintKey => write!(f, "firewall fingerprint key must contain at least 32 non-whitespace characters"),
            Self::HttpClient(error) => write!(f, "could not initialize SOC HTTP client: {error}"),
            Self::Transport(error) => write!(f, "SOC transport failed: {error}"),
            Self::Rejected(status) => write!(f, "SOC ingestion endpoint rejected the batch with HTTP {status}"),
            Self::InvalidBatch => write!(f, "SOC batches must contain between 1 and 100 events"),
        }
    }
}
impl std::error::Error for SocError {}

pub struct SocClient {
    endpoint: String,
    token: HeaderValue,
    fingerprint_key: Vec<u8>,
    client: Client,
}

impl SocClient {
    pub fn new(base_url: &str, token: String, fingerprint_key: String) -> Result<Self, SocError> {
        if token.trim().len() < 32 {
            return Err(SocError::InvalidToken);
        }
        if fingerprint_key.trim().len() < 32 {
            return Err(SocError::InvalidFingerprintKey);
        }
        let mut token_header = HeaderValue::try_from(token.trim())
            .map_err(|_| SocError::InvalidToken)?;
        token_header.set_sensitive(true);
        let parsed = Url::parse(base_url)
            .map_err(|error| SocError::InvalidUrl(error.to_string()))?;
        if !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.query().is_some()
            || parsed.fragment().is_some()
            || parsed.path() != "/"
        {
            return Err(SocError::InvalidUrl("provide an origin only; credentials, paths, query strings, and fragments are not allowed".into()));
        }
        let host = parsed.host_str()
            .ok_or_else(|| SocError::InvalidUrl("URL must include a host".into()))?;
        let loopback = host.eq_ignore_ascii_case("localhost")
            || host.parse::<IpAddr>().is_ok_and(|address| address.is_loopback());
        if parsed.scheme() != "https" && !(parsed.scheme() == "http" && loopback) {
            return Err(SocError::InsecureRemoteUrl);
        }

        let endpoint = format!("{}{}", base_url.trim_end_matches('/'), INGEST_PATH);
        let client = Client::builder()
            .timeout(Duration::from_secs(5))
            .https_only(false)
            .build()
            .map_err(|error| SocError::HttpClient(error.to_string()))?;
        Ok(Self {
            endpoint,
            token: token_header,
            fingerprint_key: fingerprint_key.trim().as_bytes().to_vec(),
            client,
        })
    }

    pub fn ingest_events(&self, events: &[SecurityEventInput]) -> Result<usize, SocError> {
        if events.is_empty() {
            return Ok(0);
        }
        let mut accepted = 0usize;
        for batch in events.chunks(MAX_BATCH_SIZE) {
            let safe_batch = batch
                .iter()
                .map(|event| self.redact_source_ip(event))
                .collect::<Result<Vec<_>, _>>()?;
            self.send_batch(&safe_batch)?;
            accepted += batch.len();
        }
        Ok(accepted)
    }

    fn redact_source_ip(&self, event: &SecurityEventInput) -> Result<SecurityEventInput, SocError> {
        let mut redacted = event.clone();
        if let Some(source_ip) = redacted.attributes.remove("source_ip") {
            redacted.summary = redacted.summary.replace(&source_ip, "[source redacted]");
            let mut mac = HmacSha256::new_from_slice(&self.fingerprint_key)
                .map_err(|_| SocError::InvalidFingerprintKey)?;
            mac.update(source_ip.as_bytes());
            let fingerprint = mac.finalize().into_bytes()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            redacted.attributes.insert("source_fingerprint".into(), fingerprint);
        }
        Ok(redacted)
    }

    fn send_batch(&self, events: &[SecurityEventInput]) -> Result<(), SocError> {
        if events.is_empty() || events.len() > MAX_BATCH_SIZE {
            return Err(SocError::InvalidBatch);
        }
        let payload = serde_json::json!({ "events": events });

        for attempt in 0..3 {
            let response = self.client
                .post(&self.endpoint)
                .header("X-NEXUS-INGESTION-TOKEN", self.token.clone())
                .json(&payload)
                .send();

            match response {
                Ok(response) if response.status() == StatusCode::ACCEPTED => return Ok(()),
                Ok(response) => {
                    let status = response.status();
                    let retryable = status == StatusCode::REQUEST_TIMEOUT
                        || status == StatusCode::TOO_MANY_REQUESTS
                        || status.is_server_error();
                    if !retryable || attempt == 2 {
                        return Err(SocError::Rejected(status));
                    }
                }
                Err(error) => {
                    let retryable = error.is_timeout() || error.is_connect();
                    if !retryable || attempt == 2 {
                        return Err(SocError::Transport(error.to_string()));
                    }
                }
            }
            thread::sleep(Duration::from_millis(200 * (1 << attempt)));
        }
        Err(SocError::Transport("retry budget exhausted".into()))
    }
}
