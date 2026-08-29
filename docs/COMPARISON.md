# T3N vs Solana port — API surface comparison

The Solana port is a 1:1 API port of the T3N WASM contract, with the storage
model changed from a host-bound KV map to on-chain PDAs. Every T3N command
has a Solana equivalent; every verdict shape matches.

| T3N WASM                | Solana Anchor             | Notes |
|-------------------------|---------------------------|-------|
| `probe-provider`        | `record_probe`            | Same JSON shape: `{provider, verdict, http_code, detail, checked_at}` |
| `list-providers`        | `list_providers`          | Same shape: `{providers: [{provider, endpoint, sealed, last}]}` |
| `rotate-secret`         | `rotate_secret`           | Plaintext only in tx input — never echoed |
| `history`               | `history`                 | Newest-first ring buffer |
| (one-time seed)         | `initialize` + `seal_provider` | Vault is set up once, providers are sealed one-by-one |
| `z:<tid>:secrets` KV    | `SecretEntry` PDA per (vault, provider) | Storage model swap |
| `z:<tid>:history` KV    | `History` PDA (16-entry ring) | Storage model swap |
| TEE host capability     | `vault.tee_worker` field (PDA-signed tx) | Auth model swap: TEE = program, worker = pubkey ACL'd at init |
| Cluster timestamp       | `Clock::get()?.unix_timestamp` | Same unix epoch, same shape |
| 4 providers (github, groq, openrouter, openai) | Same 4 providers in `providers::PROVIDERS` | Identical maintenance contract |

## Verdict shape (identical)

```json
{
  "provider": "github",
  "verdict": "VALID",
  "http_code": 200,
  "detail": "key accepted by provider",
  "checked_at": 1787780764
}
```

This is the ONLY JSON that ever leaves the program — same as the T3N
contract's egress shape exactly.

## Provider registry (identical)

```rust
PROVIDERS = [
  { name: "github",     secret_key: "github_api_key",     endpoint: "https://api.github.com/user" },
  { name: "groq",       secret_key: "groq_api_key",       endpoint: "https://api.groq.com/openai/v1/models" },
  { name: "openrouter", secret_key: "openrouter_api_key", endpoint: "https://openrouter.ai/api/v1/key" },
  { name: "openai",     secret_key: "openai_api_key",     endpoint: "https://api.openai.com/v1/models" },
]
```

## Classification logic (identical)

| HTTP | Verdict | Detail |
|---|---|---|
| 200-299 | VALID | "key accepted by provider" |
| 401, 403 | INVALID | "credentials rejected by provider" |
| 429 | RATE_LIMITED | "quota exhausted — key likely valid" |
| other | UNEXPECTED | "unclassified status code" |

## Differences (intentional, in favor of Solana)

1. **No TEE runtime dependency.** The T3N port required a TEE WASM runtime
   + a host that bound `kv_store` and `http_iface` capabilities. The Solana
   port runs on a stock Solana validator — no extra runtime.

2. **Public verifiability.** Anyone can read the on-chain `History` and
   audit trail via `solana account`. The T3N version was per-tenant in a
   private TEE — verifiable only to the tenant.

3. **Per-tenant authority key.** The T3N version used a tenant DID baked
   into the KV map names. The Solana version uses a standard Solana
   keypair as the vault authority — works with any wallet, including
   hardware wallets.

4. **Append-only ring buffer (16 entries) instead of unbounded T3N history.**
   The T3N KV was unbounded. The Solana port caps at 16 entries to keep
   rent costs predictable; older entries are FIFO-pruned.

5. **Encrypted-at-rest key material is M2.** The T3N port sealed keys
   inside a TEE; the M1 Solana port stores plaintext key material in a
   PDA. M2 swaps this for an Arcium-style encrypted blob whose
   decryption key lives in the TEE worker.
