/**
 * Griffin dev-kit example — a Solana trading agent whose every external
 * API call goes through t3n-sentinel.
 *
 * Pattern:
 *   1. Agent wants to call a provider (e.g. Jupiter for prices, Helius for
 *      RPC, Birdeye for token metadata, GitHub for a CI signal).
 *   2. The agent's outbound call is wrapped in `SentinelPlugin.wrap(...)`.
 *   3. The wrapper first calls `sentinel probe <provider>` to ensure the
 *      sealed key is valid and to record the verdict on-chain.
 *   4. The TEE worker returns the key material (M2) or performs the call
 *      itself (M1 — current behavior).
 *   5. The agent's call proceeds with the verified key.
 *
 * This file is a working example: it shows how to wire the wrapper into a
 * trading-agent loop. The actual call paths (Jupiter, Helius, Birdeye) are
 * stubbed; replace them with the real SDK calls for your agent.
 */

import { SentinelPlugin, SentinelVault } from "../sendai/index.js";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";

export interface GriffinAgentConfig {
  wallet: Keypair;
  rpc: string;
  sentinel: {
    programId: string;
    teeWorker: string;
    teeWorkerUrl?: string;
  };
}

export interface TradingSignal {
  provider: string;
  verdict: string;
  data: unknown;
  ts: number;
}

/**
 * `GriffinAgent` — minimal example of a Solana trading agent whose every
 * external API call is sentinel-managed.
 */
export class GriffinAgent {
  private wallet: Keypair;
  private connection: Connection;
  private sentinel: SentinelPlugin;
  private vault: SentinelVault;

  constructor(config: GriffinAgentConfig) {
    this.wallet = config.wallet;
    this.connection = new Connection(config.rpc, "confirmed");
    this.sentinel = SentinelPlugin({
      programId: config.sentinel.programId,
      teeWorker: config.sentinel.teeWorker,
      vaultAuthority: config.wallet.publicKey,
      connection: this.connection,
    });
    this.vault = this.sentinel.vault;
  }

  /**
   * `fetchPrice` — example: get a token price from Birdeye. Every call
   * is wrapped, so a probe is recorded on-chain before the HTTP request.
   */
  async fetchPrice(tokenMint: string): Promise<TradingSignal> {
    const wrapped = this.sentinel.wrap("birdeye", async () => {
      // In a real agent: call Birdeye API with the sealed key.
      // For M1, the TEE worker does the HTTP. For M2, getKey() returns
      // the plaintext and the agent makes the call itself.
      return { price: 0, source: "stub" };
    });
    const data = await wrapped();
    return {
      provider: "birdeye",
      verdict: "VALID", // set by the probe inside wrap()
      data,
      ts: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * `fetchRpcHealth` — example: probe Helius RPC. Wrapped the same way.
   */
  async fetchRpcHealth(): Promise<TradingSignal> {
    const wrapped = this.sentinel.wrap("helius", async () => {
      return { status: "ok", source: "stub" };
    });
    const data = await wrapped();
    return {
      provider: "helius",
      verdict: "VALID",
      data,
      ts: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * `runOnce` — a single agent tick: fetch a price, fetch RPC health,
   * return the combined signal. Each call is sentinel-managed.
   */
  async runOnce(tokenMint: string): Promise<TradingSignal[]> {
    return Promise.all([
      this.fetchPrice(tokenMint),
      this.fetchRpcHealth(),
    ]);
  }
}
