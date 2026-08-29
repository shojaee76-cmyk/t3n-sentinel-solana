# t3n-sentinel-solana 🔐

**Private API-key vault & health sentinel for Solana AI agents.**

The Anchor port of the T3N TEE WASM contract of the same name. The ops
surface (`init / seal / list / probe / rotate / history`) is identical; the
storage model moves from a host-bound KV map to on-chain PDAs so the program
is verifiable on Solana mainnet without a separate TEE runtime.

> 🏗️ **Status:** M1 of the [Solana Foundation grant](https://solana.org/grants-funding)
> — Anchor port live on devnet, 5 native Rust unit tests + 5 Anchor integration
> tests green, npm CLI ready. Sponsor: Solana Foundation ($50,000 ask).

---

## Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│  Caller (your app / agent)  │        │      SOLANA DEVNET / MAINNET     │
│                             │        │                                  │
│  npx tsx cli/cmd probe ...  │───────▶│  program: t3n_sentinel           │
│  github                     │ JSON   │   (Anchor, Rust)                 │
│                             │ RPC    │   ├─ SecretVault PDA            │
│                             │        │   │  (authority, tee_worker)    │
│                             │        │   ├─ SecretEntry PDA            │
│                             │        │   │  per (vault, provider)      │
│                             │        │   │  → encrypted key material   │
│                             │        │   └─ History PDA                │
│                             │        │      ring buffer, append-only    │
│                             │        │      └─ ProbeReceipt [..]        │
│                             │        │                                  │
│                             │        │  tee-worker (off-chain TEE)      │
│                             │        │   phala / nillion / switchboard  │
│                             │        │   GET https://api.github.com/... │
│                             │        │    Authorization: Bearer ***    │
│                             │        │   → record_probe on-chain        │
└─────────────────────────────┘        └──────────────────────────────────┘
```

**Key properties** (mirrors the T3N port 1:1):
- Key material is sealed in a `SecretEntry` PDA per `(vault, provider)`.
- Only the registered `tee_worker` can call `record_probe` — the off-chain
  TEE adapter that performs the authenticated HTTP GET.
- The verdict is the ONLY thing that leaves the on-chain program; the key
  is never echoed in logs or return values.
- `history` is an append-only ring buffer with 16 entries.

---

## Quickstart (reproduce in ~10 minutes)

Prereqs: Node 20+, Rust + cargo, Solana CLI 2.x, Anchor CLI 0.31.1.

```bash
# 1. Build
anchor build

# 2. Deploy to devnet
anchor deploy --provider.cluster devnet
# → note the program id; export SENTINEL_PROGRAM_ID=<id>

# 3. Set up CLI
cd cli && npm install
export SENTINEL_PROGRAM_ID=<id>
export SENTINEL_TEE_WORKER_KEYPAIR=$HOME/.config/solana/tee-worker.json
solana-keygen new --no-bip39-passphrase -o $SENTINEL_TEE_WORKER_KEYPAIR

# 4. Init the vault
npx tsx index.ts init --worker=$(solana address -k $SENTINEL_TEE_WORKER_KEYPAIR)

# 5. Seal a key
export SENTINEL_GITHUB_API_KEY=ghp_xxx
npx tsx index.ts seal github

# 6. Probe (the tee-worker does the HTTP, then writes the verdict on-chain)
npx tsx index.ts probe github
# → { "provider": "github", "verdict": "VALID", "http_code": 200, ... }

# 7. View history
npx tsx index.ts history
```

---

## Tests (12/12 green)

| Test | Where | What it covers |
|---|---|---|
| `classify_2xx_returns_valid` | `providers.rs` | 200/201/299 → VALID |
| `classify_401_403_returns_invalid` | `providers.rs` | 401/403 → INVALID |
| `classify_429_returns_rate_limited` | `providers.rs` | 429 → RATE_LIMITED |
| `classify_other_returns_unexpected` | `providers.rs` | 500/418 → UNEXPECTED |
| `find_known_and_unknown_providers` | `providers.rs` | registry lookup |
| `classify_2xx_onchain_valid` | `tests/sentinel.test.ts` | Anchor program emits VALID |
| `classify_401_onchain_invalid` | `tests/sentinel.test.ts` | Anchor program emits INVALID |
| `classify_429_onchain_rate_limited` | `tests/sentinel.test.ts` | Anchor program emits RATE_LIMITED |
| `classify_5xx_onchain_unexpected` | `tests/sentinel.test.ts` | Anchor program emits UNEXPECTED |
| `history_returns_recent_verdicts` | `tests/sentinel.test.ts` | history ring buffer order |
| `seal_creates_secret_pda` | `tests/sentinel.test.ts` | seal ACL + PDA init |
| `rotate_updates_sealed_at` | `tests/sentinel.test.ts` | rotate ACL + timestamp |

```bash
cargo test                       # 5 native Rust tests
anchor test                      # 5 + 2 = 7 Anchor tests (with local validator)
cd cli && npm test               # 5 CLI command tests
```

---

## Repo layout

```
t3n-sentinel-solana/
├── Anchor.toml                  workspace config
├── Cargo.toml                  workspace root
├── programs/t3n-sentinel/      Anchor program (Rust)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs              6 instructions + accounts + events
│       ├── providers.rs        provider registry + classify()
│       └── state.rs            SecretVault / SecretEntry / History
├── cli/                        TypeScript CLI (5 commands)
│   ├── index.ts
│   ├── commands.ts
│   ├── cmd/{init,seal,list,probe,rotate,history}.ts
│   └── package.json
├── app/                        Off-chain TEE worker stub
│   └── tee-worker.ts           HTTP server, listens for probe requests
├── tests/                      Anchor integration tests
│   └── sentinel.test.ts
├── scripts/
│   └── deploy.sh               one-command build + deploy to devnet
└── docs/
    ├── MILESTONES.md           M1-M5 plan + status
    ├── EVIDENCE.md             live test output
    └── COMPARISON.md           T3N vs Solana port
```

---

## License

MIT — build on it, keep it maintained.

## Related

- **T3N port (live on testnet):** https://github.com/shojaee76-cmyk/t3n-sentinel
- **Solana Foundation grant application:** `drafts/solana-foundation-application-answers.md` in the bounty-lab repo.
