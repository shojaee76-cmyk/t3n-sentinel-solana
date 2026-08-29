# @t3n/sentinel-sendai

> **Drop-in Solana Agent Kit plugin** for t3n-sentinel — sealed API keys,
> on-chain audit trail, drop-in wrapper for any agent method that does
> authenticated HTTP.

This is one of three M2 grant deliverables (`$12,000` of `$50,000` total
in the Solana Foundation grant application). The other two are
`@t3n/sentinel-elizaos` (MCP plugin) and `integrations/griffin/` (dev-kit
example).

## Install

```bash
npm install @t3n/sentinel-sendai
# (peer: solana-agent-kit ^2.0.10)
```

## Usage

```typescript
import { SentinelPlugin } from "@t3n/sentinel-sendai";
import { createSolanaAgentKit } from "solana-agent-kit";

const agent = createSolanaAgentKit(wallet, rpc);
agent.use(SentinelPlugin({
  programId: process.env.SENTINEL_PROGRAM_ID!,
  teeWorker: process.env.SENTINEL_TEE_WORKER_PUBKEY!,
  vaultAuthority: wallet.publicKey,
}));

// Wrap any agent method that needs an authenticated HTTP call:
const listMyRepos = agent.methods.github_list_repos({ owner: "shojaee76-cmyk" });
const wrapped = agent.sentinel.wrap("github", listMyRepos);
const repos = await wrapped();
```

## API

### `SentinelPlugin(config)`

Returns a `SentinelPlugin` instance with two surfaces:

- `plugin.vault` — the `SentinelVault` instance (PDA derivation, probe, history).
- `plugin.wrap(provider, fn)` — wraps a function so the probe runs first.

### `SentinelVault`

- `vaultPda()` / `historyPda()` / `secretPda(provider)` — PDA derivations.
- `probe(provider)` — submit a probe to the TEE worker (HTTP POST). Returns the canonical verdict shape.
- `history()` — fetch the on-chain history ring buffer via the TEE worker's REST endpoint.
- `getKey(provider)` — **M2 only**. Throws an informative error in M1.

## Tests (6/6 pass)

```
$ npx tsx --test tests/standalone.test.ts
# tests 6
# pass 6
# fail 0
```

## Maintenance contract

Adding a new provider = appending one line to `PROVIDERS` in the Rust
program + adding it to the `PROVIDERS` map in the TEE worker + CLI.
No client-side changes needed.

## Roadmap

- **M1** (now) — probe via TEE worker; `getKey()` throws.
- **M2** (next) — encrypted-at-rest on-chain key material (Arcium-style
  blobs); `getKey()` returns the plaintext after TEE attestation round-trip.
- **M3** (audit) — Trail of Bits review of the on-chain key material model.

## Related

- **Anchor program:** https://github.com/shojaee76-cmyk/t3n-sentinel-solana
- **T3N port (live on testnet):** https://github.com/shojaee76-cmyk/t3n-sentinel
- **Solana Foundation grant application:** `bounty-lab/drafts/solana-foundation-application-answers.md`
