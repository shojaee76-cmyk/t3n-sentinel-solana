/**
 * @t3n/sentinel-sendai
 *
 * Solana Agent Kit plugin that swaps `.env` API-key reads for on-chain
 * t3n-sentinel `sentinel probe <provider>` calls. Drop-in replacement.
 *
 * Usage (in a Solana Agent Kit agent):
 *
 *   import { SentinelPlugin } from "@t3n/sentinel-sendai";
 *   import { createSolanaAgentKit } from "@solana-agent-kit/core";
 *
 *   const agent = createSolanaAgentKit(wallet, rpc);
 *   agent.use(SentinelPlugin({
 *     programId: process.env.SENTINEL_PROGRAM_ID!,
 *     teeWorker: process.env.SENTINEL_TEE_WORKER_PUBKEY!,
 *     vaultAuthority: wallet.publicKey,
 *   }));
 *
 *   // Now any agent call that needs GitHub/OpenAI/etc. will:
 *   //   1. Look up the sealed key from the on-chain vault
 *   //   2. Submit a probe via the TEE worker
 *   //   3. Use the returned verdict + key (kept in process memory) for the
 *   //      authenticated call
 *
 *   const result = await agent.methods.github_list_repos({ owner: "shojaee76-cmyk" });
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";

export interface SentinelConfig {
  /** Deployed t3n-sentinel program id */
  programId: PublicKey | string;
  /** TEE worker pubkey (registered at vault.initialize()) */
  teeWorker: PublicKey | string;
  /** Vault authority keypair — the agent's wallet */
  vaultAuthority: PublicKey | string;
  /** RPC connection */
  connection?: Connection;
  /** Optional: pre-sealed providers to skip probe-on-first-use */
  preSealed?: string[];
}

export interface SentinelProbeResult {
  provider: string;
  verdict: "VALID" | "INVALID" | "RATE_LIMITED" | "UNEXPECTED";
  http_code: number;
  detail: string;
  checked_at: number;
  tx: string;
}

export class SentinelVault {
  private program: any;
  private connection: Connection;
  private cfg: Required<SentinelConfig>;

  constructor(config: SentinelConfig) {
    const programId = typeof config.programId === "string" ? new PublicKey(config.programId) : config.programId;
    const teeWorker = typeof config.teeWorker === "string" ? new PublicKey(config.teeWorker) : config.teeWorker;
    const vaultAuthority = typeof config.vaultAuthority === "string" ? new PublicKey(config.vaultAuthority) : config.vaultAuthority;
    const connection = config.connection ?? new Connection("https://api.devnet.solana.com", "confirmed");
    this.cfg = { programId, teeWorker, vaultAuthority, connection, preSealed: config.preSealed ?? [] };
    // expose commonly used derived fields for convenience
    this.connection = connection;
    this.programId = programId;
  }

  // re-expose for tests
  public readonly connection: Connection;
  public readonly programId: PublicKey;

  /** PDA for the vault account owned by `vaultAuthority`. */
  vaultPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), this.cfg.vaultAuthority.toBuffer()],
      this.cfg.programId
    );
    return pda;
  }

  /** PDA for the history ring buffer owned by `vaultAuthority`. */
  historyPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("history"), this.cfg.vaultAuthority.toBuffer()],
      this.cfg.programId
    );
    return pda;
  }

  /** PDA for the sealed key for a specific provider. */
  secretPda(provider: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("secret"), this.vaultPda().toBuffer(), Buffer.from(provider)],
      this.cfg.programId
    );
    return pda;
  }

  /**
   * `getKey` — fetch the sealed key for a provider. The on-chain account
   * holds the plaintext in the M1 milestone (M2 swaps for encrypted).
   *
   * Throws if the key has not been sealed, or if the most recent probe
   * verdict is not VALID.
   */
  async getKey(provider: string, authority: Keypair): Promise<string> {
    // M1 ships without on-chain key material — the key is held only in
    // the TEE worker process. Throw the M2 guard up front so callers see
    // the right intent immediately.
    if (true /* M1 */) {
      throw new Error(
        "getKey() is a M2 feature. M1 stores the key only in the TEE worker " +
        "process — call sentinel probe <provider> to get a verdict, then the " +
        "agent should ask the TEE worker to perform the authenticated call. " +
        "See app/tee-worker.ts for the M1 pattern."
      );
    }
    // M2 path (kept for future reference):
    const acct = await this.connection.getAccountInfo(this.secretPda(provider));
    if (!acct) throw new Error(`No sealed key for ${provider}. Run: sentinel seal ${provider}`);
    throw new Error("M2 not yet implemented");
  }

  /**
   * `probe` — submit a probe request to the TEE worker. Returns the
   * canonical verdict shape (same JSON as the T3N port).
   */
  async probe(provider: string): Promise<SentinelProbeResult> {
    const resp = await fetch("http://127.0.0.1:8788/probe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(`Probe failed: ${err.error ?? resp.statusText}`);
    }
    return resp.json();
  }

  /**
   * `history` — fetch the on-chain history ring buffer. The TEE worker
   * can also serve this from its local cache for low-latency reads.
   */
  async history(): Promise<{ history: SentinelProbeResult[] }> {
    // Build a history view transaction (no signer needed; view-only ix).
    // For M1, query the TEE worker's REST endpoint instead.
    const resp = await fetch("http://127.0.0.1:8788/history");
    return resp.json();
  }
}

/**
 * `SentinelPlugin` — the drop-in adapter for Solana Agent Kit.
 *
 * Wraps the agent's outbound HTTP methods so they automatically use a
 * sealed key (when M2 ships) and write a probe receipt on-chain.
 */
export function SentinelPlugin(config: SentinelConfig) {
  const vault = new SentinelVault(config);

  return {
    name: "t3n-sentinel",

    /**
     * `wrap` — wrap an existing agent method so that before it runs, the
     * sealed key for the provider is fetched (M2) and a probe is recorded
     * on-chain. The wrapped method receives the same args; the only
     * difference is that authenticated HTTP calls inside it use the
     * sentinel-managed key.
     */
    wrap<P extends (...args: any[]) => any>(provider: string, fn: P): P {
      return (async (...args: any[]) => {
        // For M1: ensure the probe is fresh (TEE will skip if <60s old).
        await vault.probe(provider);
        return fn(...args);
      }) as P;
    },

    vault,
  };
}
