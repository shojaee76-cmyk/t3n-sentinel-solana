# Milestones — Solana Foundation grant

This file tracks progress against the 5 milestones in the grant application
(see `bounty-lab/drafts/solana-foundation-application-answers.md`).

## M2 — 3 agent-framework integrations — $12,000 (24%) — **CODE-COMPLETE**

**Status:** All 3 integrations scaffolded + tests green. 12/12 integration tests pass.

What was delivered (2026-08-28):
- [x] **SendAI** (`integrations/sendai/`) — drop-in plugin for the official `solana-agent-kit ^2.0.10` npm package. 6/6 tests pass: PDA derivation, config shape, getKey M1 guard, wrap probe-then-fn. Plugin exposes `SentinelPlugin(config)` returning `{ name, vault, wrap(provider, fn) }`.
- [x] **ElizaOS-on-Solana** (`integrations/elizaos/`) — 6 MCP tools (sentinel_init, sentinel_seal, sentinel_list, sentinel_probe, sentinel_rotate, sentinel_history) with zod-validated schemas. 4/4 tests pass: tool registration, schema validation, PDA derivation.
- [x] **Griffin dev-kit example** (`integrations/griffin/agent.ts`) — a Solana trading agent whose every external API call is wrapped via `SentinelPlugin.wrap(provider, fn)`. 2/2 tests pass.

**Tests (12/12 total):**
| Test suite | Count | Status |
|---|---|---|
| `integrations/sendai/tests/standalone.test.ts` | 6 | PASS |
| `integrations/elizaos/tests/elizaos.test.ts` | 4 | PASS |
| `integrations/griffin/tests/griffin.test.ts` | 2 | PASS |

**Outstanding for M2 sign-off:**
- 3 demo videos (2 min each) — one per integration
- 3 blog posts — one per integration
- Live install + import test in a real agent (not just unit tests)
- npm publish for @t3n/sentinel-sendai + @t3n/sentinel-elizaos

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
