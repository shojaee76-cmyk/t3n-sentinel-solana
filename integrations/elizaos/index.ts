/**
 * @t3n/sentinel-elizaos
 *
 * ElizaOS-on-Solana plugin that exposes t3n-sentinel vault ops as MCP tools
 * (Model Context Protocol). An ElizaOS agent that has this plugin loaded can:
 *
 *   - sentinel_init         register a vault + TEE worker
 *   - sentinel_seal         seal a new API key for a provider
 *   - sentinel_list         list providers + their last verdict
 *   - sentinel_probe        run a probe (TEE worker does the HTTP)
 *   - sentinel_rotate       rotate a key
 *   - sentinel_history      view the on-chain history ring buffer
 *
 * The plugin implements the MCP server side; ElizaOS connects to it via
 * the standard MCP client. The 6 tools mirror the 6 CLI commands 1:1.
 *
 * Usage (ElizaOS side):
 *
 *   import { SentinelPlugin } from "@t3n/sentinel-elizaos";
 *   const eliza = new ElizaOS({ plugins: [SentinelPlugin({...})] });
 *
 * Or run the MCP server standalone:
 *
 *   $ npx tsx integrations/elizaos/server.ts
 *   # exposes the 6 tools over stdio (MCP)
 */

import { z } from "zod";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

export interface ElizaSentinelConfig {
  programId: PublicKey | string;
  teeWorker: PublicKey | string;
  vaultAuthority: PublicKey | string;
  rpc?: string;
  teeWorkerUrl?: string; // default http://127.0.0.1:8788
}

const PROVIDERS = ["github", "groq", "openrouter", "openai"] as const;
type Provider = typeof PROVIDERS[number];

// ============================================================ MCP tool schemas

export const TOOL_SCHEMAS = {
  sentinel_init: {
    description: "Initialize a t3n-sentinel vault + register a TEE worker.",
    input: z.object({
      tee_worker: z.string().describe("TEE worker pubkey (base58)"),
    }),
  },
  sentinel_seal: {
    description: "Seal a new API key for a provider.",
    input: z.object({
      provider: z.enum(PROVIDERS),
      api_key: z.string().describe("The API key to seal (plaintext, tx-only)"),
    }),
  },
  sentinel_list: {
    description: "List providers + their last verdict (newest first).",
    input: z.object({}),
  },
  sentinel_probe: {
    description: "Run an authenticated probe (TEE worker does the HTTP).",
    input: z.object({
      provider: z.enum(PROVIDERS),
    }),
  },
  sentinel_rotate: {
    description: "Rotate an existing sealed key.",
    input: z.object({
      provider: z.enum(PROVIDERS),
      new_api_key: z.string().describe("New key value (plaintext, tx-only)"),
    }),
  },
  sentinel_history: {
    description: "View the on-chain history ring buffer (newest first).",
    input: z.object({}),
  },
} as const;

// ============================================================ vault wrapper

export class ElizaSentinelVault {
  private cfg: Required<ElizaSentinelConfig>;
  private connection: Connection;
  private programId: PublicKey;

  constructor(config: ElizaSentinelConfig) {
    this.programId = typeof config.programId === "string" ? new PublicKey(config.programId) : config.programId;
    this.connection = new Connection(config.rpc ?? "https://api.devnet.solana.com", "confirmed");
    this.cfg = {
      programId: this.programId,
      teeWorker: typeof config.teeWorker === "string" ? new PublicKey(config.teeWorker) : config.teeWorker,
      vaultAuthority: typeof config.vaultAuthority === "string" ? new PublicKey(config.vaultAuthority) : config.vaultAuthority,
      rpc: config.rpc ?? "https://api.devnet.solana.com",
      teeWorkerUrl: config.teeWorkerUrl ?? "http://127.0.0.1:8788",
    };
  }

  vaultPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), (typeof this.cfg.vaultAuthority === "string" ? new PublicKey(this.cfg.vaultAuthority) : this.cfg.vaultAuthority).toBuffer()],
      this.programId
    );
    return pda;
  }

  historyPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("history"), (typeof this.cfg.vaultAuthority === "string" ? new PublicKey(this.cfg.vaultAuthority) : this.cfg.vaultAuthority).toBuffer()],
      this.programId
    );
    return pda;
  }

  secretPda(provider: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("secret"), this.vaultPda().toBuffer(), Buffer.from(provider)],
      this.programId
    );
    return pda;
  }

  async callTeeWorker(method: string, body: unknown): Promise<unknown> {
    const resp = await fetch(`${this.cfg.teeWorkerUrl}${method}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) throw new Error(`TEE worker error: ${resp.statusText}`);
    return resp.json();
  }

  // ============================================================ MCP tool impls

  async sentinel_init(input: z.infer<typeof TOOL_SCHEMAS.sentinel_init.input>) {
    return this.callTeeWorker("/init", { tee_worker: input.tee_worker });
  }

  async sentinel_seal(input: z.infer<typeof TOOL_SCHEMAS.sentinel_seal.input>) {
    return this.callTeeWorker("/seal", { provider: input.provider, api_key: input.api_key });
  }

  async sentinel_list() {
    return this.callTeeWorker("/list", null);
  }

  async sentinel_probe(input: z.infer<typeof TOOL_SCHEMAS.sentinel_probe.input>) {
    return this.callTeeWorker("/probe", { provider: input.provider });
  }

  async sentinel_rotate(input: z.infer<typeof TOOL_SCHEMAS.sentinel_rotate.input>) {
    return this.callTeeWorker("/rotate", { provider: input.provider, new_api_key: input.new_api_key });
  }

  async sentinel_history() {
    return this.callTeeWorker("/history", null);
  }
}

// ============================================================ plugin entry point

export function SentinelPlugin(config: ElizaSentinelConfig) {
  const vault = new ElizaSentinelVault(config);

  return {
    name: "t3n-sentinel-elizaos",
    version: "0.1.0",

    // ElizaOS tool registry
    tools: Object.fromEntries(
      Object.entries(TOOL_SCHEMAS).map(([name, schema]) => [
        name,
        {
          description: schema.description,
          inputSchema: schema.input,
          handler: (input: unknown) => (vault as any)[name](input),
        },
      ])
    ),

    vault,
  };
}
