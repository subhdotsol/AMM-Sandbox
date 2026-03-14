import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amms } from "../target/types/amms";
import { assert } from "chai";

import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

// Helper function to get token balance
async function getTokenBalance(
  connection: anchor.web3.Connection,
  tokenAccount: anchor.web3.PublicKey
): Promise<number> {
  const info = await connection.getTokenAccountBalance(tokenAccount);
  return Number(info.value.amount);
}


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
    // 1. Create token mints X and Y
    // 2. Derive PDA for the pool config and LP token mint
    // 3. Get associated token addresses for vault X and vault Y
    // 4. Initialize the pool on-chain
    // 5. Mint initial tokens to the admin user
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

    // Get pre-deposit balances
    const preUserX = await getTokenBalance(connection, userAtaX);
    const preUserY = await getTokenBalance(connection, userAtaY);
    const preVaultX = await getTokenBalance(connection, vaultX);
    const preVaultY = await getTokenBalance(connection, vaultY);

    // Deposit liquidity:
    // This will transfer token X and token Y from the user to the vaults
    // and mint LP tokens to the user's LP ATA.
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

    // Get post-deposit balances
    const postUserX = await getTokenBalance(connection, userAtaX);
    const postUserY = await getTokenBalance(connection, userAtaY);
    const postVaultX = await getTokenBalance(connection, vaultX);
    const postVaultY = await getTokenBalance(connection, vaultY);
    const postUserLp = await getTokenBalance(connection, userLpAta);

    // Verify balances changed correctly
    // Since this is the first deposit, the exact maxX and maxY amounts are taken
    assert.equal(preUserX - postUserX, maxX.toNumber(), "User X balance should decrease by maxX");
    assert.equal(preUserY - postUserY, maxY.toNumber(), "User Y balance should decrease by maxY");
    assert.equal(postVaultX - preVaultX, maxX.toNumber(), "Vault X balance should increase by maxX");
    assert.equal(postVaultY - preVaultY, maxY.toNumber(), "Vault Y balance should increase by maxY");
    assert.equal(postUserLp, depositAmount.toNumber(), "User should receive depositAmount of LP tokens");
  });

  it("Swaps token X for token Y", async () => {
    const amountIn = new anchor.BN(100_000);
    const minOut = new anchor.BN(50_000);

    // Get pre-swap balances
    const preUserX = await getTokenBalance(connection, userAtaX);
    const preUserY = await getTokenBalance(connection, userAtaY);
    const preVaultX = await getTokenBalance(connection, vaultX);
    const preVaultY = await getTokenBalance(connection, vaultY);

    // Execute swap:
    // User provides token X and receives token Y in return.
    // The curve determines exactly how much Y the user gets based on pool reserves.
    const tx = await program.methods
      .swap(true, amountIn, minOut)
      .accounts({
        user: admin.publicKey,
        mintX,
        mintY,
        config: configPda,
      })
      .rpc();

    console.log(`Swapped X for Y Transaction Signature: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log("Swapped X for Y");

    // Get post-swap balances
    const postUserX = await getTokenBalance(connection, userAtaX);
    const postUserY = await getTokenBalance(connection, userAtaY);
    const postVaultX = await getTokenBalance(connection, vaultX);
    const postVaultY = await getTokenBalance(connection, vaultY);

    // Verify token X was deducted from the user and added to the vault
    assert.equal(preUserX - postUserX, amountIn.toNumber(), "User X balance should decrease by amountIn");
    assert.equal(postVaultX - preVaultX, amountIn.toNumber(), "Vault X balance should increase by amountIn");

    // Verify token Y was given to the user and deducted from the vault
    const obtainedY = postUserY - preUserY;
    assert.isTrue(obtainedY >= minOut.toNumber(), `User should receive at least minOut of token Y. Received: ${obtainedY}, expected at least: ${minOut.toNumber()}`);
    // Because of precise curve calculation, the vault balance decrease might not exactly match the amount user ATAs increased if there are other side effects, but usually they match.
    // However, if fee is taken, it's kept in the vault. Let's check exactly how much vault decreased.
    assert.equal(preVaultY - postVaultY, obtainedY, "Vault Y balance should decrease by the amount user received");
  });

  it("Swaps token Y for token X", async () => {
    const amountIn = new anchor.BN(100_000);
    const minOut = new anchor.BN(50_000);

    // Get pre-swap balances
    const preUserX = await getTokenBalance(connection, userAtaX);
    const preUserY = await getTokenBalance(connection, userAtaY);
    const preVaultX = await getTokenBalance(connection, vaultX);
    const preVaultY = await getTokenBalance(connection, vaultY);

    // Execute swap:
    // User provides token Y and receives token X in return.
    const tx = await program.methods
      .swap(false, amountIn, minOut)
      .accounts({
        user: admin.publicKey,
        mintX,
        mintY,
        config: configPda,
      })
      .rpc();

    console.log(`Swapped Y for X Transaction Signature: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log("Swapped Y for X");

    // Get post-swap balances
    const postUserX = await getTokenBalance(connection, userAtaX);
    const postUserY = await getTokenBalance(connection, userAtaY);
    const postVaultX = await getTokenBalance(connection, vaultX);
    const postVaultY = await getTokenBalance(connection, vaultY);

    // Verify token Y was deducted from the user and added to the vault
    assert.equal(preUserY - postUserY, amountIn.toNumber(), "User Y balance should decrease by amountIn");
    assert.equal(postVaultY - preVaultY, amountIn.toNumber(), "Vault Y balance should increase by amountIn");

    // Verify token X was given to the user and deducted from the vault
    const obtainedX = postUserX - preUserX;
    assert.isTrue(obtainedX >= minOut.toNumber(), `User should receive at least minOut of token X. Received: ${obtainedX}, expected at least: ${minOut.toNumber()}`);
    assert.equal(preVaultX - postVaultX, obtainedX, "Vault X balance should decrease by the amount user received");
  });

  it("Withdraws liquidity from the pool", async () => {
    const withdrawAmount = new anchor.BN(500_000);
    const minX = new anchor.BN(50_000); // lowered bounds dynamically since previous swaps change the ratio
    const minY = new anchor.BN(50_000);

    // Get pre-withdraw balances
    const preUserX = await getTokenBalance(connection, userAtaX);
    const preUserY = await getTokenBalance(connection, userAtaY);
    const preVaultX = await getTokenBalance(connection, vaultX);
    const preVaultY = await getTokenBalance(connection, vaultY);
    const preUserLp = await getTokenBalance(connection, userLpAta);

    // Execute withdraw:
    // User burns LP tokens and receives a proportional share of vault X and vault Y
    const tx = await program.methods
      .withdraw(withdrawAmount, minX, minY)
      .accounts({
        user: admin.publicKey,
        mintX,
        mintY,
        config: configPda,
      })
      .signers([admin.payer])
      .rpc();

    console.log(`Withdrawn Liquidity Transaction Signature: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    console.log("Withdrawn liquidity");

    // Get post-withdraw balances
    const postUserX = await getTokenBalance(connection, userAtaX);
    const postUserY = await getTokenBalance(connection, userAtaY);
    const postVaultX = await getTokenBalance(connection, vaultX);
    const postVaultY = await getTokenBalance(connection, vaultY);
    const postUserLp = await getTokenBalance(connection, userLpAta);

    // Verify LP tokens were burned
    assert.equal(preUserLp - postUserLp, withdrawAmount.toNumber(), "User LP balance should decrease by withdrawAmount");

    // Verify user received at least minX and minY
    const receivedX = postUserX - preUserX;
    const receivedY = postUserY - preUserY;
    assert.isTrue(receivedX >= minX.toNumber(), `User should receive at least minX. Received: ${receivedX}, expected: ${minX.toNumber()}`);
    assert.isTrue(receivedY >= minY.toNumber(), `User should receive at least minY. Received: ${receivedY}, expected: ${minY.toNumber()}`);

    // Verify vault balances decreased proportionally
    assert.equal(preVaultX - postVaultX, receivedX, "Vault X balance should decrease by the amount user received");
    assert.equal(preVaultY - postVaultY, receivedY, "Vault Y balance should decrease by the amount user received");
  });
});
