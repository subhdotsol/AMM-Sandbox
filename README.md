# AMM-Sandbox

A Solana Automated Market Maker (AMM) program built with the Anchor framework. This program implements a constant product curve (similar to Uniswap V2) allowing users to create liquidity pools, provide liquidity, and swap SPL tokens.

## Features

- **Initialize Pool**: Create a new liquidity pool for an SPL token pair (Token X and Token Y) with a configurable fee.
- **Deposit Liquidity**: Add liquidity to the pool and receive LP (Liquidity Provider) tokens representing your share of the pool.
- **Swap**: Swap Token X for Token Y, or Token Y for Token X, using the constant product formula ($x \cdot y = k$) with slippage protection.
- **Withdraw Liquidity**: Burn your LP tokens to withdraw your proportional share of Token X and Token Y from the pool.

## Program Architecture

The program consists of the following instructions:

- `initialize`: Sets up the AMM pool configuration, creates the LP token mint, and initializes the token vaults.
- `deposit`: Calculates and transfers the required proportional amounts of Token X and Token Y into the vaults, and mints LP tokens to the user.
- `swap`: Swaps a specified input token amount for an output token, applying the pool's trading fee, and updating the constant product curve.
- `withdraw`: Burns the specified amount of LP tokens and returns the proportional share of underlying tokens from the vaults to the user.

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (v1.16+ recommended)
- [Anchor Framework](https://www.anchor-lang.com/docs/installation) (v0.29.0+ recommended)
- [Node.js](https://nodejs.org/) and Yarn

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/subhdotsol/AMM-Sandbox.git
   cd AMM-Sandbox
   ```

2. **Install dependencies:**
   ```bash
   yarn install
   ```

3. **Build the program:**
   ```bash
   anchor build
   ```

4. **Run the tests:**
   Make sure to have a local validator running or simply use the `anchor test` command which spins up a local validator automatically.
   ```bash
   anchor test
   ```

## Testing

The e2e tests are written in TypeScript using Mocha and Chai. They can be found in the `tests/` directory.

To run the test suite:
```bash
anchor test
```

### Test Coverage

The test suite validates the following core functionalities:
1. **Initializing the AMM pool:** Creating the token mints, config PDA, LP token mint, and the X and Y token vaults.
2. **Depositing liquidity:** Providing initial liquidity, enforcing the constant product constraints, and issuing LP tokens.
3. **Swapping tokens:** Swapping Token X for Token Y using the constant product formula and enforcing slippage bounds.
4. **Withdrawing liquidity:** Burning LP tokens to withdraw a proportionate share of the underlying X and Y tokens.

### Expected Output

```console
  amm creation
AMM Initialization Transaction Signature: https://explorer.solana.com/tx/57LraFYWJgjRuctLwvGK67CVun5k9LLGLjF274ThAGxSUyEH2EPAu5rEYQh1NR8fzmevSVeGgUTXazBFzdLPoLLb?cluster=devnet
AMM initialized successfully
Minted initial Token X: https://explorer.solana.com/tx/G5QbxF64ibmxbGtWHHv5NG2GRkx4XbbRQgKVPg5YTARtqJemPZHotDD8KLkf34GKRNDEgSVfkZ55k78Xa6FtZBA?cluster=devnet
Minted initial Token Y: https://explorer.solana.com/tx/bvX9hD42UgfsNrUnJtvw8UsPWVxiQ26kveWdT4px8LJZUs4eqAnNQyiNrDrtvFAvHm4YvdHGsdWV1nEfuGK3Gqu?cluster=devnet
    ✔ Initializing the AMM pool (5872ms)
Deposited Liquidity Transaction Signature: https://explorer.solana.com/tx/3wBJVeraPKxEKuaVZynh8cwBhSmqR9yiYmCNXFQG182yWTJUBXZbezoFz3Up9f8zb1butUTM7qjDgUvneABqNPCh?cluster=devnet
Deposited liquidity
    ✔ Deposits liquidity into the pool (462ms)
Swapped X for Y Transaction Signature: https://explorer.solana.com/tx/QxeGhkRzUd9Wp84DBG1SMghKs3SQJrRqqTxAFq3NEb5Wxz6HBXFsjCtgMCG1FBZ9GkCiJunSGJv4sFsYNnzQDKu?cluster=devnet
Swapped X for Y
    ✔ Swaps token X for token Y (702ms)
Withdrawn Liquidity Transaction Signature: https://explorer.solana.com/tx/5wGMmMYP38RvJ4vsdEm8NmqwzFojfs1xLb5tPZndjZZTAK7xv9cMHiyn6d7mgNMkb5ByuYnyRWy5U6mSGPPARjEa?cluster=devnet
Withdrawn liquidity
    ✔ Withdraws liquidity from the pool (933ms)

  4 passing (8s)
```

## License

MIT License
