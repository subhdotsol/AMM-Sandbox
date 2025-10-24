#![allow(deprecated)]
#![allow(unused_attributes)]

use anchor_lang::prelude::*;

declare_id!("95RfKC6UDmxeMjR9AAhF9xVauYmeFQawVK5W51tHn8wb");

pub mod constant;
pub mod errors;
pub mod instructions;
pub mod states;

pub use instructions::*;
#[program]
pub mod amms {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        seed: u64,
        fee: u16,
        authority: Option<Pubkey>,
    ) -> Result<()> {
        ctx.accounts.initialize(seed, fee, authority, &ctx.bumps)?;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64, max_x: u64, max_y: u64) -> Result<()> {
        ctx.accounts.deposit(amount, max_x, max_y)
    }

    pub fn swap(ctx: Context<Swap>, is_x: bool, amount_in: u64, min_amount_out: u64) -> Result<()> {
        ctx.accounts.swap(is_x, amount_in, min_amount_out)
    }
}
