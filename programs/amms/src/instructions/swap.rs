use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};
use constant_product_curve::{ConstantProduct, LiquidityPair};

use crate::errors::AmmError;
use crate::states::Config;

#[derive(Accounts)]
pub struct Swap<'info> {

    // The user who is initiating the swap must sign the transaction
    #[account(mut)]
    pub user: Signer<'info>,

    // The mint account for token x in te trading pair
    #[account(mint::token_program = token_program)] // ensure this is a valid mint
    pub mint_x: Account<'info, Mint>,


    // The mint account for token y in te trading pair
    #[account(mint::token_program = token_program)] // ensure this is a valid mint
    pub mint_y: Account<'info, Mint>,

    pub config: Account<'info, Config>,

    // The main configuration account for the AMM pool
    // used for reading supply information in swap calculations
    // uses PDA derived from "lp" seed and config key 
    #[account(
        seeds = [b"lp", config.key().as_ref()],
        bump,
    )]
    pub mint_lp: Account<'info, Mint>,

    // The vault that holds all deposited token X 
    #[account(
        mut, // will be debited during swap
        associated_token::mint = mint_x,
        associated_token::authority = config,
        associated_token::token_program = token_program,
    )]
    pub vault_x: Box<Account<'info, TokenAccount>>,

    /// The vault that holds all deposited token Y
    // mutable because swap operation either deposit or withdraws from the vault 
    // Associated token account own
    #[account(
        mut , 
        associated_token::mint = mint_y,
        associated_token::authority = config,
        associated_token::token_program = token_program
    )]
    pub vault_y: Box<Account<'info, TokenAccount>>,

    // user token account for token x 
    /// Will be created if it doesnt exists , user pays for creation 
    /// mutable because we may transfer tokens to/from this account 
    #[account(
        init_if_needed,
        payer = user , 
        associated_token::mint = mint_x,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_ata_x: Box<Account<'info, TokenAccount>>,

    // user token account for token y 
    // will be create if it doesnt exists , user pays for creation
    // mutable because we may transfer tokens to/from this account
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint_y,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_ata_y: Box<Account<'info, TokenAccount>>,

     /// SPL Token program for token operations
    pub token_program: Program<'info, Token>,
    /// Associated Token program for ATA operations
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// System program for account creation
    pub system_program: Program<'info, System>,

}


impl <'info> Swap <'info> { 

    // the swap logic steps : 

// step 1 : Validate pool is not locked and amounts are valid 
// step 2 : Initialize constant product curve with current pool state 
// step 3 : Calculate swap amounts using the curve (accounting for fees )
// step 4 : Validate slippage protection (output meets minimum requirements)
// step 5 : Deposit input tokens to appropriate vault
// step 6 : Withdraw output tokes from from the appropriate vault to user


// Args : 
// is_x -> true if swapping token x for y , false if swapping y for x
// amount_in - amount of input token to swap
// min_amount_out - minimum acceptable amount of output token (slippage protection)

    pub fn swap (&mut self , is_x: bool, amount_in: u64, min_amount_out: u64) -> Result<()> {

    // ensure the pool is not locked for swaps 
    require!( !self.config.locked , AmmError::PoolLocked );
    // ensure user is swapping a positive amount 
    require!( amount_in > 0 , AmmError::InvalidAmount );

    // initialize the constant product curve with current pool state 
    // Initialize constant product curve with current pool state
        let mut curve = ConstantProduct::init(
            self.vault_x.amount,    // Current token X reserves
            self.vault_y.amount,    // Current token Y reserves
            self.mint_lp.supply,    // Current LP token supply
            self.config.fee,        // Trading fee in basis points
            None,                   // No additional configuration
        )
        .map_err(AmmError::from)?;

    // Determine swap direction and calculate amounts
    let p = match is_x {
        true => LiquidityPair::X , // swapping x for y 
        false => LiquidityPair::Y , // swapping y for x 
    };

    // calculate swap amounts 
    let swap_result = curve.swap(p , amount_in , min_amount_out).map_err(AmmError::from)?;

    // validate that the calculated amounts are valid 
    require!(swap_result.deposit !=0 , AmmError::InvalidAmount );
    require!(swap_result.withdraw !=0 , AmmError::InvalidAmount );

    // Execute the swap by depositing input tokens and withdrawing output tokens 
    self.deposit_token(is_x , swap_result.deposit)?;
    self.withdraw_token(is_x , swap_result.withdraw)?;

    Ok(())
    }


    // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    /// Deposits tokens from user's account to the appropriate vault
    /// This increases the vault's balance and decreases the user's balance
    /// 
    /// # Arguments
    /// * `is_x` - true for token X, false for token Y
    /// * `amount` - Amount of tokens to deposit
    /// 
    /// # Returns
    /// * `Result<()>` - Ok if successful, error otherwise
    pub fn deposit_token(&mut self, is_x: bool, amount: u64) -> Result<()> {
        // Select appropriate accounts based on token type
        let (from, to, mint, decimals) = match is_x {
            true => (
                self.user_ata_x.to_account_info(),    // Transfer from user's X account
                self.vault_x.to_account_info(),       // Transfer to vault X
                self.mint_x.to_account_info(),        // Token X mint
                self.mint_x.decimals,                 // Token X decimals
            ),
            false => (
                self.user_ata_y.to_account_info(),    // Transfer from user's Y account
                self.vault_y.to_account_info(),       // Transfer to vault Y
                self.mint_y.to_account_info(),        // Token Y mint
                self.mint_y.decimals,                 // Token Y decimals
            ),
        };

        let cpi_program = self.token_program.to_account_info();

        // Set up transfer instruction accounts
        let cpi_accounts = TransferChecked {
            from,
            to,
            authority: self.user.to_account_info(),  // User signs the transfer
            mint,
        };

        let cpi_context = CpiContext::new(cpi_program, cpi_accounts);

        // Execute the transfer with amount and decimal validation
        transfer_checked(cpi_context, amount, decimals)
    }



    // --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------


    /// Withdraws tokens from vault to user's account
    /// This decreases the vault's balance and increases the user's balance
    /// 
    /// # Arguments
    /// * `is_x` - true for token X, false for token Y
    /// * `amount` - Amount of tokens to withdraw
    /// 
    /// # Returns
    /// * `Result<()>` - Ok if successful, error otherwise
    pub fn withdraw_token(&mut self, is_x: bool, amount: u64) -> Result<()> {
        // Select appropriate accounts based on token type
        let (from, to, mint, decimals) = match is_x {
            true => (
                self.vault_x.to_account_info(),       // Transfer from vault X
                self.user_ata_x.to_account_info(),    // Transfer to user's X account
                self.mint_x.to_account_info(),        // Token X mint
                self.mint_x.decimals,                 // Token X decimals
            ),
            false => (
                self.vault_y.to_account_info(),       // Transfer from vault Y
                self.user_ata_y.to_account_info(),    // Transfer to user's Y account
                self.mint_y.to_account_info(),        // Token Y mint
                self.mint_y.decimals,                 // Token Y decimals
            ),
        };

        let cpi_program = self.token_program.to_account_info();

        // Set up transfer instruction accounts
        let cpi_accounts = TransferChecked {
            from,
            to,
            mint,
            authority: self.config.to_account_info(),  // Config PDA signs the transfer
        };

        // Create signer seeds for config PDA
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"config",
            &self.config.seed.to_le_bytes(),
            &[self.config.config_bump],
        ]];

        // Create CPI context with PDA signer
        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        // Execute the transfer with amount and decimal validation
        transfer_checked(cpi_context, amount, decimals)
    }
}

