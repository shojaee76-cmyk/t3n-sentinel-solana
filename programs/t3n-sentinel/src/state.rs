//! On-chain state types for t3n-sentinel.

use anchor_lang::prelude::*;

/// Vault metadata: authority, TEE worker, history pointer, sealed count.
#[account]
pub struct SecretVault {
    pub authority: Pubkey,     // 32
    pub tee_worker: Pubkey,    // 32
    pub history: Pubkey,       // 32
    pub providers_sealed: u8,  // 1
    pub bump: u8,              // 1
}
impl SecretVault {
    pub const SIZE: usize = 32 + 32 + 32 + 1 + 1;
}

/// One sealed secret per (vault, provider). Key material is stored as a
/// string blob here for the devnet milestone; M2 swaps it for an
/// Arcium-style encrypted blob whose decryption key lives in the TEE.
#[account]
pub struct SecretEntry {
    pub vault: Pubkey,       // 32
    pub provider: String,    // 4 + N
    pub sealed_at: i64,      // 8
    pub bump: u8,            // 1
    pub _pad: [u8; 7],       // 7 (align to 8)
}
impl SecretEntry {
    pub const SIZE: usize = 32 + (4 + 64) + 8 + 1 + 7;
}

/// Append-only ring buffer of probe verdicts. HISTORY_MAX entries.
#[account]
pub struct History {
    pub vault: Pubkey,         // 32
    pub count: u8,             // 1
    pub bump: u8,              // 1
    pub entries: [ProbeReceipt; HISTORY_MAX],
}
pub const HISTORY_MAX: usize = 16;
impl History {
    pub const SIZE: usize =
        32 + 1 + 1 + (HISTORY_MAX * ProbeReceipt::FIXED_SIZE) + 7; // +7 pad
}

/// Canonical probe outcome — same shape as the T3N Verdict.
#[derive(AnchorSerialize, AnchorDeserialize, serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
pub struct ProbeReceipt {
    pub provider: String,   // 4 + up to 32
    pub verdict: String,    // 4 + up to 16
    pub http_code: u16,     // 2
    pub detail: String,     // 4 + up to 64
    pub checked_at: i64,    // 8
}
impl ProbeReceipt {
    // Fixed size used for HISTORY sizing.
    pub const FIXED_SIZE: usize = 4 + 32 + 4 + 16 + 2 + 4 + 64 + 8;
}
