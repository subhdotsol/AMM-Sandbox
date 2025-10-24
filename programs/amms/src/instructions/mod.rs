// This file is:
// Declaring the initialize submodule.
// Re-exporting its public items for cleaner access from other parts of your program.
// Acting as a centralized point to manage all instructions in your AMM program.

// This line re-exports everything (*) from the initialize module, making it accessible from outside this module without needing to refer to initialize::

// use instructions::initialize_vault; // instead of instructions::initialize::initialize_vault

pub mod initialize;
pub use initialize::*;

pub mod deposit;
pub use deposit::*;

pub mod swap;
pub use swap::*;
