mod api_server;
mod http_server;
mod protocol;
mod sessions;
mod term;
mod term_socket;
mod tty_spawn;

use std::env;
use std::ffi::OsString;
use std::path::Path;

use anyhow::anyhow;
use argument_parser::Parser;

fn main() -> Result<(), anyhow::Error> {
    let mut parser = Parser::from_env();

    let mut control_path = env::home_dir()
        .ok_or_else(|| anyhow!("Unable to determine home directory"))?
        .join(".vibetunnel/control");
    let mut session_name = None::<String>;
    let mut session_id = std::env::var("TTY_SESSION_ID").ok();
    let mut send_key = None::<String>;
    let mut send_text = None::<String>;
    let mut signal = None::<i32>;
    let mut stop = false;
    let mut kill = false;
    let mut cleanup = false;
    let mut show_session_info = false;
    let mut show_session_id = false;
    let mut serve_address = None::<String>;
    let mut static_path = None::<String>;
    let mut password = None::<String>;
    let mut cmdline = Vec::<OsString>::new();

    while let Some(param) = parser.param()? {
        match param {
            p if p.is_long("control-path") => {
                control_path = parser.value()?;
            }
            p if p.is_long("list-sessions") => {
                let control_path: &Path = &control_path;
                let sessions = sessions::list_sessions(control_path)?;
                println!("{}", serde_json::to_string_pretty(&sessions)?);
                return Ok(());
            }
            p if p.is_long("show-session-info") => {
                show_session_info = true;
            }
            p if p.is_long("show-session-id") => {
                show_session_id = true;
                show_session_info = true;
            }
            p if p.is_long("session-name") => {
                session_name = Some(parser.value()?);
            }
            p if p.is_long("session") => {
                session_id = Some(parser.value()?);
            }
            p if p.is_long("send-key") => {
                send_key = Some(parser.value()?);
            }
            p if p.is_long("send-text") => {
                send_text = Some(parser.value()?);
            }
            p if p.is_long("signal") => {
                let signal_str: String = parser.value()?;
                signal = Some(
                    signal_str
                        .parse()
                        .map_err(|_| anyhow!("Invalid signal number: {}", signal_str))?,
                );
            }
            p if p.is_long("stop") => {
                stop = true;
            }
            p if p.is_long("kill") => {
                kill = true;
            }
            p if p.is_long("cleanup") => {
                cleanup = true;
            }
            p if p.is_long("serve") => {
                let addr: String = parser.value()?;
                serve_address = Some(if addr.contains(':') {
                    addr
                } else {
                    format!("127.0.0.1:{addr}")
                });
            }
            p if p.is_long("static-path") => {
                static_path = Some(parser.value()?);
            }
            p if p.is_long("password") => {
                password = Some(parser.value()?);
            }
            p if p.is_pos() => {
                cmdline.push(parser.value()?);
            }
            p if p.is_long("help") => {
                println!("Usage: tty-fwd [options] -- <command>");
                println!("Options:");
                println!("  --control-path <path>   Where the control folder is located");
                println!("  --session-name <name>   Names the session when creating");
                println!("  --list-sessions         List all sessions");
                println!("  --find-session          Find session for current process");
                println!(
                    "  --print-id              Print session ID only (implies --find-session)"
                );
                println!("  --session <I>           Operate on this session");
                println!("  --send-key <key>        Send key input to session");
                println!("                          Keys: arrow_up, arrow_down, arrow_left, arrow_right, escape, enter, ctrl_enter, shift_enter");
                println!("  --send-text <text>      Send text input to session");
                println!("  --signal <number>       Send signal number to session PID");
                println!(
                    "  --stop                  Send SIGTERM to session (equivalent to --signal 15)"
                );
                println!(
                    "  --kill                  Send SIGKILL to session (equivalent to --signal 9)"
                );
                println!("  --cleanup               Remove exited sessions (all if no --session specified)");
                println!("  --serve <addr>          Start HTTP server (hostname:port or just port for 127.0.0.1)");
                println!(
                    "  --static-path <path>    Path to static files directory for HTTP server"
                );
                println!("  --password <password>   Enable basic auth with random username and specified password");
                println!("  --spawn-terminal <app>  Spawn command in a new terminal window (supports Terminal.app, Ghostty.app)");
                println!("  --help                  Show this help message");
                return Ok(());
            }
            _ => return Err(parser.unexpected().into()),
        }
    }

    // show session info
    if show_session_info || show_session_id {
        let control_path: &Path = &control_path;
        if let Some(entry) = sessions::find_current_session(control_path)? {
            if show_session_id {
                println!("{}", entry.session_id);
            } else {
                println!("{}", serde_json::to_string_pretty(&entry)?);
            }
        }
        return Ok(());
    }

    // Handle send-key command
    if let Some(key) = send_key {
        if let Some(sid) = &session_id {
            return sessions::send_key_to_session(&control_path, sid, &key);
        }
        return Err(anyhow!("--send-key requires --session <session_id>"));
    }

    // Handle send-text command
    if let Some(text) = send_text {
        if let Some(sid) = &session_id {
            return sessions::send_text_to_session(&control_path, sid, &text);
        }
        return Err(anyhow!("--send-text requires --session <session_id>"));
    }

    // Handle signal command
    if let Some(sig) = signal {
        if let Some(sid) = &session_id {
            return sessions::send_signal_to_session(&control_path, sid, sig);
        }
        return Err(anyhow!("--signal requires --session <session_id>"));
    }

    // Handle stop command (SIGTERM)
    if stop {
        if let Some(sid) = &session_id {
            return sessions::send_signal_to_session(&control_path, sid, 15);
        }
        return Err(anyhow!("--stop requires --session <session_id>"));
    }

    // Handle kill command (SIGKILL)
    if kill {
        if let Some(sid) = &session_id {
            return sessions::send_signal_to_session(&control_path, sid, 9);
        }
        return Err(anyhow!("--kill requires --session <session_id>"));
    }

    // Handle cleanup command
    if cleanup {
        return sessions::cleanup_sessions(&control_path, session_id.as_deref());
    }

    // Handle serve command
    if let Some(addr) = serve_address {
        // Setup signal handler to update session statuses on shutdown
        crate::term_socket::setup_shutdown_handler();

        ctrlc::set_handler(move || {
            println!("Ctrl-C received, updating session statuses and exiting...");
            let _ = crate::term_socket::update_all_sessions_to_exited();
            std::process::exit(0);
        })
        .unwrap();
        return crate::api_server::start_server(&addr, control_path, static_path, password);
    }

    // Spawn command
    let exit_code = sessions::spawn_command(control_path, session_name, session_id, cmdline)?;
    std::process::exit(exit_code);
}
