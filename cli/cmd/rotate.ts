/**
 * `sentinel rotate <provider>` — seal a new value over the old one.
 *
 * Mirrors the T3N `rotate-secret` instruction: same ACL (vault authority
 * only), same plaintext-disposal (key never echoed in return).
 */

import * as anchor from "@coral-xyz/anchor";
import { RPC, PROGRAM_ID, requireEnv, KEYPAIR_PATH } from "../commands.js";

export async function run(args: string[]) {
  const provider = args[0];
  if (!provider) throw new Error("Usage: sentinel rotate <provider>");
  const envName = `SENTINEL_${provider.toUpperCase()}_API_KEY`;
  const newKey = requireEnv(envName);

  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const keypair = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(require("fs").readFileSync(KEYPAIR_PATH, "utf8")))
  );
  const wallet = new anchor.Wallet(keypair);
  const provider_ = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider_);
  const program = new anchor.Program(/* @ts-ignore */ {}, provider_);

  const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), wallet.publicKey.toBuffer()],
    new anchor.web3.PublicKey(PROGRAM_ID)
  );
  const [secretPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("secret"), vaultPda.toBuffer(), Buffer.from(provider)],
    new anchor.web3.PublicKey(PROGRAM_ID)
  );

  const sig = await program.methods
    .rotateSecret(provider, newKey)
    .accounts({
      vault: vaultPda,
      secret: secretPda,
      authority: wallet.publicKey,
    })
    .rpc();

  return {
    rotated: provider,
    sealed_at: Math.floor(Date.now() / 1000),
    tx: sig,
  };
}
