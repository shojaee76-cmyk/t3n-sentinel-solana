/**
 * `sentinel seal <provider>` — write a new API key into the vault.
 *
 * Reads the plaintext from env SENTINEL_<PROVIDER>_API_KEY. The plaintext
 * exists only in the transaction's input and the on-chain account; never
 * in any log or return value.
 */

import * as anchor from "@coral-xyz/anchor";
import { RPC, PROGRAM_ID, requireEnv, KEYPAIR_PATH } from "../commands.js";

export async function run(args: string[]) {
  const provider = args[0];
  if (!provider) throw new Error("Usage: sentinel seal <provider>");

  const envName = `SENTINEL_${provider.toUpperCase()}_API_KEY`;
  const apiKey = requireEnv(envName);

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
    .sealProvider(provider, apiKey)
    .accounts({
      vault: vaultPda,
      secret: secretPda,
      authority: wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  // Return a verdict-shaped JSON (matches the T3N contract):
  return {
    provider,
    sealed: true,
    tx: sig,
    // NEVER echo the key
  };
}
