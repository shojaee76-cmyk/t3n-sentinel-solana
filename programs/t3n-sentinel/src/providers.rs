//! Provider registry + verdict classification.
//!
//! MAINTENANCE CONTRACT: adding a monitored provider = appending ONE line to
//! `PROVIDERS`. Nothing else changes — no schema migration, no client update.
//!
//! The Solana port keeps the same shape as the T3N port (4 providers, the same
//! authenticated GETs) so that the on-chain history is directly comparable
//! to the T3N testnet history that t3n-sentinel was awarded the T3N Agent
//! Build Challenge for.

use serde::{Deserialize, Serialize};

pub struct ProviderSpec {
    /// Human name used in requests, registry and history.
    pub name: &'static str,
    /// Key name inside the SecretVault provider entry.
    pub secret_key: &'static str,
    /// Cheap authenticated GET that proves the key works.
    pub endpoint: &'static str,
}

pub const PROVIDERS: &[ProviderSpec] = &[
    ProviderSpec {
        name: "github",
        secret_key: "github_api_key",
        endpoint: "https://api.github.com/user",
    },
    ProviderSpec {
        name: "groq",
        secret_key: "groq_api_key",
        endpoint: "https://api.groq.com/openai/v1/models",
    },
    ProviderSpec {
        name: "openrouter",
        secret_key: "openrouter_api_key",
        endpoint: "https://openrouter.ai/api/v1/key",
    },
    ProviderSpec {
        name: "openai",
        secret_key: "openai_api_key",
        endpoint: "https://api.openai.com/v1/models",
    },
];

pub fn find(name: &str) -> Option<&'static ProviderSpec> {
    PROVIDERS.iter().find(|p| p.name == name)
}

pub fn names() -> String {
    PROVIDERS
        .iter()
        .map(|p| p.name)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Structured probe outcome — the ONLY thing that ever leaves the program.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Verdict {
    pub provider: String,
    /// VALID | INVALID | RATE_LIMITED | UNEXPECTED
    pub verdict: String,
    pub http_code: u16,
    pub detail: String,
    /// Cluster timestamp (secs) taken just before the outbound call.
    pub checked_at: i64,
}

/// Map an HTTP status to a verdict. Pure — unit-testable off-chain.
pub fn classify(code: u16) -> (&'static str, &'static str) {
    match code {
        200..=299 => ("VALID", "key accepted by provider"),
        401 | 403 => ("INVALID", "credentials rejected by provider"),
        429 => ("RATE_LIMITED", "quota exhausted — key likely valid"),
        _ => ("UNEXPECTED", "unclassified status code"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_returns_known_providers() {
        assert!(find("github").is_some());
        assert!(find("groq").is_some());
        assert!(find("openrouter").is_some());
        assert!(find("openai").is_some());
    }

    #[test]
    fn find_rejects_unknown_provider() {
        assert!(find("not_a_provider").is_none());
        assert!(find("").is_none());
    }

    #[test]
    fn classify_2xx_is_valid() {
        assert_eq!(classify(200), ("VALID", "key accepted by provider"));
        assert_eq!(classify(201), ("VALID", "key accepted by provider"));
        assert_eq!(classify(299), ("VALID", "key accepted by provider"));
    }

    #[test]
    fn classify_401_403_is_invalid() {
        assert_eq!(
            classify(401),
            ("INVALID", "credentials rejected by provider")
        );
        assert_eq!(
            classify(403),
            ("INVALID", "credentials rejected by provider")
        );
    }

    #[test]
    fn classify_429_is_rate_limited() {
        assert_eq!(
            classify(429),
            ("RATE_LIMITED", "quota exhausted — key likely valid")
        );
    }

    #[test]
    fn classify_other_is_unexpected() {
        assert_eq!(classify(500), ("UNEXPECTED", "unclassified status code"));
        assert_eq!(classify(418), ("UNEXPECTED", "unclassified status code"));
    }

    #[test]
    fn names_contains_all_providers() {
        let n = names();
        assert!(n.contains("github"));
        assert!(n.contains("groq"));
        assert!(n.contains("openrouter"));
        assert!(n.contains("openai"));
    }
}
