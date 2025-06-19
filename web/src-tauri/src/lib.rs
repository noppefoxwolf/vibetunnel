pub mod commands;
pub mod terminal;
pub mod server;

#[cfg(mobile)]
pub fn init() {
    // Mobile-specific initialization
}