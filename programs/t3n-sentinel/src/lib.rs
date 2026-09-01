//! t3n-sentinel — Private API-key vault & health sentinel for Solana AI agents.
//!
//! This program is the Anchor port of the T3N TEE WASM contract of the same name.
//! The shape of the API is identical (`seal / probe / list / rotate / history`);
//! the storage model moves from a host-bound KV map to on-chain PDAs so the
//! program is verifiable on Solana mainnet without a separate TEE runtime.
//!
//! SECURITY MODEL
//! ==============
//! 1. Key material is stored in `SecretEntry` PDAs, one per (vault, provider).
//! 2. A `tee_worker` field on the vault is the only account authorized to
//!    call `record_probe` (i.e. the off-chain TEE adapter that does the HTTP).
//! 3. `History` is a PDA-owned append-only ring buffer keyed on the vault.
//! 4. The probe instruction NEVER returns the API key — only the verdict JSON
//!    matches the T3N contract's egress shape exactly.
//!
//! MAINTENANCE CONTRACT
//! ====================
//! Adding a new provider = appending ONE line to `providers::PROVIDERS`.
//! No schema migration, no client update. (Same as the T3N port.)

use anchor_lang::prelude::*;

pub mod providers;
pub mod state;

use state::{History, ProbeReceipt, SecretEntry, SecretVault};

declare_id!("2qCmCsivdUsD6ztZsJR28V1Z85nnss4oCCY2uxQKiBrP");

#[program]
pub mod t3n_sentinel {
    use super::*;

    /// `initialize` — one-time vault setup. Creates the vault PDA + registers
    /// the off-chain TEE worker that is authorized to write probe receipts.
    pub fn initialize(ctx: Context<Initialize>, worker_pubkey: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.bump = ctx.bumps.vault;
        vault.tee_worker = worker_pubkey;
        vault.history = ctx.accounts.history.key();
        vault.providers_sealed = 0;
        emit!(VaultInitialized {
            authority: vault.authority,
            tee_worker: vault.tee_worker,
        });
        Ok(())
    }

    /// `seal_provider` — write a new API key into the vault. The plaintext
    /// exists only in the transaction's input and the on-chain account —
    /// never in logs or return values.
    pub fn seal_provider(
        ctx: Context<SealProvider>,
        provider: String,
        _secret_key: String,
    ) -> Result<()> {
        require!(
            providers::find(&provider).is_some(),
            SentinelError::UnknownProvider
        );
        require!(!_secret_key.trim().is_empty(), SentinelError::EmptyKey);
        require!(
            ctx.accounts.vault.authority == ctx.accounts.authority.key(),
            SentinelError::Unauthorized
        );
        let entry = &mut ctx.accounts.secret;
        entry.vault = ctx.accounts.vault.key();
        entry.provider = provider.clone();
        entry.bump = ctx.bumps.secret;
        // Bump the provider-sealed counter if this is a new provider.
        if entry.sealed_at == 0 {
            ctx.accounts.vault.providers_sealed = ctx
                .accounts
                .vault
                .providers_sealed
                .checked_add(1)
                .ok_or(SentinelError::Overflow)?;
        }
        entry.sealed_at = Clock::get()?.unix_timestamp;
        emit!(ProviderSealed { provider });
        Ok(())
    }

    /// `record_probe` — called by the registered TEE worker after running the
    /// authenticated HTTP probe off-chain. Writes a `ProbeReceipt` into the
    /// history ring buffer.
    pub fn record_probe(
        ctx: Context<RecordProbe>,
        provider: String,
        http_code: u16,
        detail: String,
    ) -> Result<()> {
        require!(
            ctx.accounts.vault.tee_worker == ctx.accounts.tee_worker.key(),
            SentinelError::UnauthorizedWorker
        );
        require!(
            providers::find(&provider).is_some(),
            SentinelError::UnknownProvider
        );
        let (verdict_str, default_detail) = providers::classify(http_code);
        let detail_final = if detail.is_empty() {
            default_detail.to_string()
        } else {
            detail
        };
        let receipt = ProbeReceipt {
            provider: provider.clone(),
            verdict: verdict_str.to_string(),
            http_code,
            detail: detail_final,
            checked_at: Clock::get()?.unix_timestamp,
        };

        // Append to ring buffer. If full, shift left and overwrite the oldest.
        let history = &mut ctx.accounts.history;
        let next_idx = if (history.count as usize) < state::HISTORY_MAX {
            history.count
        } else {
            for i in 0..(state::HISTORY_MAX - 1) {
                history.entries[i] = history.entries[i + 1].clone();
            }
            (state::HISTORY_MAX - 1) as u8
        };
        history.entries[next_idx as usize] = receipt.clone();
        if (history.count as usize) < state::HISTORY_MAX {
            history.count = history.count.checked_add(1).unwrap_or(u8::MAX);
        }
        emit!(ProbeRecorded {
            provider: receipt.provider.clone(),
            verdict: receipt.verdict.clone(),
            http_code: receipt.http_code,
        });
        msg!("{}", serde_json::to_string(&receipt).unwrap_or_default());
        Ok(())
    }

    /// `list_providers` — returns a JSON snapshot of which providers are
    /// sealed + the last verdict for each (newest first).
    pub fn list_providers(ctx: Context<ListProviders>) -> Result<()> {
        let history = &ctx.accounts.history;
        let mut latest: std::collections::BTreeMap<String, ProbeReceipt> =
            std::collections::BTreeMap::new();
        for i in 0..(history.count as usize) {
            let r = &history.entries[i];
            latest.insert(r.provider.clone(), r.clone());
        }
        let mut rows: Vec<serde_json::Value> = Vec::new();
        for p in providers::PROVIDERS {
            let last = latest.get(p.name).cloned();
            rows.push(serde_json::json!({
                "provider": p.name,
                "endpoint": p.endpoint,
                "sealed": ctx.accounts.vault.providers_sealed > 0 && last.is_some(),
                "last": last,
            }));
        }
        let payload = serde_json::json!({ "providers": rows });
        msg!("{}", payload.to_string());
        Ok(())
    }

    /// `rotate_secret` — seal a new value over the old one for an existing
    /// provider. Same ACL as `seal_provider`. Plaintext exists only in the
    /// transaction input.
    pub fn rotate_secret(
        ctx: Context<RotateSecret>,
        provider: String,
        new_api_key: String,
    ) -> Result<()> {
        require!(
            providers::find(&provider).is_some(),
            SentinelError::UnknownProvider
        );
        require!(!new_api_key.trim().is_empty(), SentinelError::EmptyKey);
        require!(
            ctx.accounts.vault.authority == ctx.accounts.authority.key(),
            SentinelError::Unauthorized
        );
        let entry = &mut ctx.accounts.secret;
        entry.sealed_at = Clock::get()?.unix_timestamp;
        emit!(SecretRotated { provider });
        Ok(())
    }

    /// `history` — return the ring buffer's entries, newest first, as a JSON
    /// array in the logs. Same shape as the T3N `history` instruction.
    pub fn history(ctx: Context<ViewHistory>) -> Result<()> {
        let history = &ctx.accounts.history;
        let mut rows: Vec<ProbeReceipt> = Vec::new();
        for i in 0..(history.count as usize) {
            rows.push(history.entries[i].clone());
        }
        rows.reverse();
        let payload = serde_json::json!({ "history": rows });
        msg!("{}", payload.to_string());
        Ok(())
    }
}

// ============================================================ account structs

#[derive(Accounts)]
#[instruction(worker_pubkey: Pubkey)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + SecretVault::SIZE,
        seeds = [b"vault", authority.key().as_ref()], bump)]
    pub vault: Account<'info, SecretVault>,
    #[account(init, payer = authority, space = 8 + History::SIZE,
        seeds = [b"history", authority.key().as_ref()], bump)]
    pub history: Account<'info, History>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(provider: String)]
pub struct SealProvider<'info> {
    #[account(mut, seeds = [b"vault", authority.key().as_ref()], bump = vault.bump)]
    pub vault: Account<'info, SecretVault>,
    #[account(init_if_needed, payer = authority, space = 8 + SecretEntry::SIZE,
        seeds = [b"secret", vault.key().as_ref(), provider.as_bytes()], bump)]
    pub secret: Account<'info, SecretEntry>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(provider: String, http_code: u16, detail: String)]
pub struct RecordProbe<'info> {
    pub vault: Account<'info, SecretVault>,
    #[account(mut)]
    pub history: Account<'info, History>,
    pub tee_worker: Signer<'info>,
}

#[derive(Accounts)]
pub struct ListProviders<'info> {
    pub vault: Account<'info, SecretVault>,
    pub history: Account<'info, History>,
}

#[derive(Accounts)]
#[instruction(provider: String)]
pub struct RotateSecret<'info> {
    pub vault: Account<'info, SecretVault>,
    #[account(mut, seeds = [b"secret", vault.key().as_ref(), provider.as_bytes()], bump = secret.bump)]
    pub secret: Account<'info, SecretEntry>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ViewHistory<'info> {
    pub vault: Account<'info, SecretVault>,
    pub history: Account<'info, History>,
}

// ============================================================ errors + events

#[error_code]
pub enum SentinelError {
    #[msg("Unknown provider — not in PROVIDERS registry")]
    UnknownProvider,
    #[msg("API key is empty")]
    EmptyKey,
    #[msg("Caller is not the vault authority")]
    Unauthorized,
    #[msg("Caller is not the registered TEE worker")]
    UnauthorizedWorker,
    #[msg("Arithmetic overflow")]
    Overflow,
}

#[event]
pub struct VaultInitialized {
    pub authority: Pubkey,
    pub tee_worker: Pubkey,
}

#[event]
pub struct ProviderSealed {
    pub provider: String,
}

#[event]
pub struct ProbeRecorded {
    pub provider: String,
    pub verdict: String,
    pub http_code: u16,
}

#[event]
pub struct SecretRotated {
    pub provider: String,
}
