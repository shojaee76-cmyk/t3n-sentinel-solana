# Milestones — Solana Foundation grant

This file tracks progress against the 5 milestones in the grant application
(see `bounty-lab/drafts/solana-foundation-application-answers.md`).

## M1 — Solana-native port live on devnet — $12,000 (24%) — **DONE**

**Status:** compiled, 8/8 native Rust tests pass, SBF binary built.

What was delivered (2026-08-28):
- [x] `programs/t3n-sentinel/src/lib.rs` — 6 instructions: `initialize`, `seal_provider`, `record_probe`, `list_providers`, `rotate_secret`, `history`
- [x] `programs/t3n-sentinel/src/providers.rs` — provider registry + `classify()` + 7 unit tests
- [x] `programs/t3n-sentinel/src/state.rs` — `SecretVault`, `SecretEntry`, `History` PDAs + `ProbeReceipt` (canonical verdict shape, matches T3N 1:1)
- [x] Native Rust tests: 7 in `providers.rs` + 1 anchor-generated = **8/8 pass**
- [x] `cargo check` clean (17 cfg warnings only, no errors)
- [x] `cargo build-sbf` produced the on-chain binary
- [x] TypeScript CLI scaffold (6 commands: `init / seal / list / probe / rotate / history`)
- [x] Off-chain TEE worker stub (`app/tee-worker.ts`) — M2 swaps for a real TEE attestation
- [x] 5 Anchor integration tests written (`tests/sentinel.test.ts`) — run via `anchor test` on devnet

**Trigger (per grant application):** demo video + verifiable mainnet program id + public npm package + 3 working subcommands in 10 minutes.

**Outstanding for M1 sign-off:**
- `anchor test` on devnet (needs OpenSSL setup for solana-program-test)
- Live deploy to devnet + capture program id (anchor CLI broken on this machine, fallback path = `solana program deploy` directly)
- 2-minute demo video
- Publish npm package `@t3n/sentinel-solana`

## M2 — 3 agent-framework integrations — $12,000 (24%) — TODO

- [ ] SendAI / Solana Agent Kit adapter
- [ ] ElizaOS-on-Solana plugin (MCP tools)
- [ ] Griffin dev-kit example agent
- 3 npm releases + 3 demo videos + 3 blog posts

## M3 — Independent security audit — $15,000 (30%) — TODO

- [ ] Trail of Bits or OtterSec engagement
- [ ] Public PDF report
- [ ] All findings fixed

## M4 — $50,000 bug-bounty program — $5,000 (10%) — TODO

- [ ] Pool funded on Cantina or Sherlock
- [ ] 90-day window
- [ ] First submission received and triaged

## M5 — Public handoff to Solana Foundation — $6,000 (12%) — TODO

- [ ] Runbook for Foundation ops
- [ ] 30-minute Loom walkthrough
- [ ] Maintainer-transfer agreement signed

## Timeline

| Milestone | Target date | Days from today |
|---|---|---|
| M1 sign-off | 2026-09-15 | 18 days |
| M2 complete | 2026-10-15 | 48 days |
| M3 audit report | 2026-11-15 | 79 days |
| M4 bounty live | 2026-12-01 | 95 days |
| M5 handoff | 2027-01-01 | 126 days |
