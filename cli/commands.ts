export interface Command {
  name: string;
  run: () => Promise<(args: string[]) => Promise<unknown>>;
}

export const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
export const PROGRAM_ID =
  process.env.SENTINEL_PROGRAM_ID ??
  "Sentine1t3nS0LanaPubkey11111111111111111111"; // placeholder; updated after first build
export const KEYPAIR_PATH =
  process.env.SENTINEL_KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
