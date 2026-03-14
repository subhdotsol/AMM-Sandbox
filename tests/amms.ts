import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amms } from "../target/types/amms";

import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

describe("amm creation", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.amms as Program<Amms>;
  const connection = provider.connection;
  const admin = provider.wallet;

  let mintX: anchor.web3.PublicKey;
  let mintY: anchor.web3.PublicKey;
  let lpMint: anchor.web3.PublicKey;

  let configPda: anchor.web3.PublicKey;
  let vaultX: anchor.web3.PublicKey;
  let vaultY: anchor.web3.PublicKey;

  let userAtaX: anchor.web3.PublicKey;
  let userAtaY: anchor.web3.PublicKey;
  let userLpAta: anchor.web3.PublicKey;

  const seed = new anchor.BN(42);
  const fee = 30;

  it("Initializing the AMM pool", async () => {
    mintX = await createMint(connection, admin.payer, admin.publicKey, null, 6);
    mintY = await createMint(connection, admin.payer, admin.publicKey, null, 6);

    [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [lpMint] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lp"), configPda.toBuffer()],
      program.programId
    );

    vaultX = await getAssociatedTokenAddress(mintX, configPda, true);
    vaultY = await getAssociatedTokenAddress(mintY, configPda, true);

    const tx = await program.methods
      .initialize(seed, fee, null)
      .accounts({
        admin: admin.publicKey,
        mintX,
        mintY,
        config: configPda,
        mintLp: lpMint,
        vaultX,
        vaultY,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log(`AMM Initialization Transaction Signature: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    console.log("AMM initialized successfully");

    // Create user token accounts and mint initial balances
    const ataX = await getOrCreateAssociatedTokenAccount(
      connection,
      admin.payer,
      mintX,
      admin.publicKey
    );
    const ataY = await getOrCreateAssociatedTokenAccount(
      connection,
      admin.payer,
      mintY,
      admin.publicKey
    );
    const ataLp = await getOrCreateAssociatedTokenAccount(
      connection,
      admin.payer,
      lpMint,
      admin.publicKey
    );

    const txMintX = await mintTo(
      connection,
      admin.payer,
      mintX,
      ataX.address,
      admin.payer,
      1_000_000
    );
    console.log(`Minted initial Token X: https://explorer.solana.com/tx/${txMintX}?cluster=devnet`);

    const txMintY = await mintTo(
      connection,
      admin.payer,
      mintY,
      ataY.address,
      admin.payer,
      1_000_000
    );
    console.log(`Minted initial Token Y: https://explorer.solana.com/tx/${txMintY}?cluster=devnet`);

    userAtaX = ataX.address;
    userAtaY = ataY.address;
    userLpAta = ataLp.address;
  });

  it("Deposits liquidity into the pool", async () => {
    const depositAmount = new anchor.BN(1_000_000);
    const maxX = new anchor.BN(500_000);
    const maxY = new anchor.BN(500_000);

    const tx = await program.methods
      .deposit(depositAmount, maxX, maxY)
      .accounts({
        user: admin.publicKey,
        mintX,
        mintY,
        config: configPda,
        vaultX,
        vaultY,
        userAtaX,
        userAtaY,
        userAtaLp: userLpAta,
      })
      .rpc();

    console.log(`Deposited Liquidity Transaction Signature: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log("Deposited liquidity");
  });

  it("Swaps token X for token Y", async () => {
    const amountIn = new anchor.BN(100_000);
    const minOut = new anchor.BN(50_000);

    const tx = await program.methods
      .swap(true, amountIn, minOut)
      .accounts({
        user: admin.publicKey,
        mintX,
        mintY,
        config: configPda,
        vaultX,
        vaultY,
        userAtaX,
        userAtaY,
      })
      .rpc();

    console.log(`Swapped X for Y Transaction Signature: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log("Swapped X for Y");
  });

  it("Withdraws liquidity from the pool", async () => {
    const withdrawAmount = new anchor.BN(500_000);
    const minX = new anchor.BN(100_000);
    const minY = new anchor.BN(100_000);

    const tx = await program.methods
      .withdraw(withdrawAmount, minX, minY)
      .accounts({
        user: admin.publicKey,
        mintX,
        mintY,
        config: configPda,
        vaultX,
        vaultY,
        userAtaX,
        userAtaY,
      })
      .signers([admin.payer])
      .rpc();

    console.log(`Withdrawn Liquidity Transaction Signature: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log("Withdrawn liquidity");
  });
});
