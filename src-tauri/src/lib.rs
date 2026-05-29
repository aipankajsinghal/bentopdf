use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, WindowEvent,
};

// ── AI key state ─────────────────────────────────────────────────────────────

struct ApiKeyState(Mutex<Option<String>>);

fn gemini_url(key: &str) -> String {
    format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={}",
        key
    )
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err("invalid hex length".to_string());
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

fn load_or_create_app_key(config_dir: &std::path::Path) -> Result<[u8; 32], String> {
    use rand::RngCore;
    let key_path = config_dir.join("app_key.bin");
    if key_path.exists() {
        let bytes = std::fs::read(&key_path).map_err(|e| e.to_string())?;
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
    }
    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);
    std::fs::write(&key_path, &key).map_err(|e| e.to_string())?;
    Ok(key)
}

fn encrypt_api_key(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    use aes_gcm::aead::Aead;
    use rand::RngCore;
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).map_err(|e| e.to_string())?;
    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    Ok(bytes_to_hex(&combined))
}

fn decrypt_api_key(hex_data: &str, key: &[u8; 32]) -> Result<String, String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    use aes_gcm::aead::Aead;
    let combined = hex_to_bytes(hex_data)?;
    if combined.len() < 12 {
        return Err("encrypted data too short".to_string());
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let cipher = Aes256Gcm::new(key.into());
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher.decrypt(nonce, ciphertext).map_err(|e| e.to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ai_set_key(key: String, state: State<'_, ApiKeyState>, app: AppHandle) -> Result<(), String> {
    {
        let mut lock = state.0.lock().map_err(|e| e.to_string())?;
        *lock = if key.is_empty() { None } else { Some(key.clone()) };
    }
    if let Ok(config_dir) = app.path().app_config_dir() {
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
        let content = if key.is_empty() {
            "{}".to_string()
        } else {
            let app_key = load_or_create_app_key(&config_dir)?;
            let encrypted = encrypt_api_key(&key, &app_key)?;
            serde_json::json!({ "gemini_key_enc": encrypted }).to_string()
        };
        std::fs::write(config_dir.join("ai_config.json"), content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn ai_has_key(state: State<'_, ApiKeyState>) -> bool {
    state.0.lock().map(|l| l.is_some()).unwrap_or(false)
}

#[tauri::command]
async fn ai_generate_text(prompt: String, state: State<'_, ApiKeyState>) -> Result<String, String> {
    let key = state.0.lock().map_err(|e| e.to_string())?.clone()
        .ok_or_else(|| "Gemini API key not configured".to_string())?;
    let body = serde_json::json!({ "contents": [{ "parts": [{ "text": prompt }] }] });
    let client = reqwest::Client::new();
    let resp = client.post(gemini_url(&key)).json(&body).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let err: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        return Err(err["error"]["message"].as_str().unwrap_or("Gemini API error").to_string());
    }
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("").to_string())
}

#[tauri::command]
async fn ai_generate_vision(prompt: String, image_base64: String, state: State<'_, ApiKeyState>) -> Result<String, String> {
    let key = state.0.lock().map_err(|e| e.to_string())?.clone()
        .ok_or_else(|| "Gemini API key not configured".to_string())?;
    let body = serde_json::json!({
        "contents": [{ "parts": [
            { "text": prompt },
            { "inline_data": { "mime_type": "image/jpeg", "data": image_base64 } }
        ]}]
    });
    let client = reqwest::Client::new();
    let resp = client.post(gemini_url(&key)).json(&body).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let err: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        return Err(err["error"]["message"].as_str().unwrap_or("Gemini API error").to_string());
    }
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("").to_string())
}

// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(ApiKeyState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            ai_set_key,
            ai_has_key,
            ai_generate_text,
            ai_generate_vision,
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::new().build());

    builder
        .setup(|app| {
            // Load persisted Gemini API key
            if let Ok(config_dir) = app.path().app_config_dir() {
                let config_file = config_dir.join("ai_config.json");
                if let Ok(content) = std::fs::read_to_string(&config_file) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(enc) = json["gemini_key_enc"].as_str() {
                            // Encrypted key path
                            if let Ok(app_key) = load_or_create_app_key(&config_dir) {
                                if let Ok(key) = decrypt_api_key(enc, &app_key) {
                                    if !key.is_empty() {
                                        let state = app.state::<ApiKeyState>();
                                        *state.0.lock().unwrap() = Some(key);
                                    }
                                }
                            }
                        } else if let Some(key) = json["gemini_key"].as_str() {
                            // Migrate plaintext key to encrypted storage
                            if !key.is_empty() {
                                let state = app.state::<ApiKeyState>();
                                *state.0.lock().unwrap() = Some(key.to_string());
                                if let Ok(app_key) = load_or_create_app_key(&config_dir) {
                                    if let Ok(encrypted) = encrypt_api_key(key, &app_key) {
                                        let new_content = serde_json::json!({ "gemini_key_enc": encrypted }).to_string();
                                        let _ = std::fs::write(&config_file, new_content);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Setup logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(desktop)]
            {
                // File menu
                let open_item = MenuItem::with_id(app, "open", "Open PDF...", true, Some("CmdOrCtrl+O"))?;
                let save_item = MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?;
                let save_as_item = MenuItem::with_id(app, "save-as", "Save As...", true, Some("CmdOrCtrl+Shift+S"))?;
                let export_item = MenuItem::with_id(app, "export", "Export...", true, Some("CmdOrCtrl+E"))?;
                let close_item = MenuItem::with_id(app, "close-doc", "Close Document", true, Some("CmdOrCtrl+W"))?;

                let file_menu = Submenu::with_items(
                    app,
                    "File",
                    true,
                    &[
                        &open_item,
                        &PredefinedMenuItem::separator(app)?,
                        &save_item,
                        &save_as_item,
                        &export_item,
                        &PredefinedMenuItem::separator(app)?,
                        &close_item,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::quit(app, Some("Exit"))?,
                    ],
                )?;

                // Edit menu
                let undo_item = MenuItem::with_id(app, "undo", "Undo", true, Some("CmdOrCtrl+Z"))?;
                let redo_item = MenuItem::with_id(app, "redo", "Redo", true, Some("CmdOrCtrl+Shift+Z"))?;
                let copy_item = MenuItem::with_id(app, "copy-pages", "Copy Pages", true, Some("CmdOrCtrl+C"))?;
                let cut_item = MenuItem::with_id(app, "cut-pages", "Cut Pages", true, Some("CmdOrCtrl+X"))?;
                let paste_item = MenuItem::with_id(app, "paste-pages", "Paste Pages", true, Some("CmdOrCtrl+V"))?;
                let select_all_item = MenuItem::with_id(app, "select-all", "Select All Pages", true, Some("CmdOrCtrl+A"))?;
                let deselect_item = MenuItem::with_id(app, "deselect", "Deselect All", true, Some("Escape"))?;

                let edit_menu = Submenu::with_items(
                    app,
                    "Edit",
                    true,
                    &[
                        &undo_item,
                        &redo_item,
                        &PredefinedMenuItem::separator(app)?,
                        &copy_item,
                        &cut_item,
                        &paste_item,
                        &PredefinedMenuItem::separator(app)?,
                        &select_all_item,
                        &deselect_item,
                    ],
                )?;

                // View menu
                let zoom_in_item = MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+Plus"))?;
                let zoom_out_item = MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+Minus"))?;
                let fit_page_item = MenuItem::with_id(app, "fit-page", "Fit to Page", true, Some("CmdOrCtrl+0"))?;
                let toggle_thumbnails_item = MenuItem::with_id(app, "toggle-thumbnails", "Toggle Thumbnails", true, Some("CmdOrCtrl+T"))?;
                let toggle_ribbon_item = MenuItem::with_id(app, "toggle-ribbon", "Toggle Ribbon Labels", true, Some("CmdOrCtrl+F1"))?;

                let view_menu = Submenu::with_items(
                    app,
                    "View",
                    true,
                    &[
                        &zoom_in_item,
                        &zoom_out_item,
                        &fit_page_item,
                        &PredefinedMenuItem::separator(app)?,
                        &toggle_thumbnails_item,
                        &toggle_ribbon_item,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::fullscreen(app, Some("Fullscreen"))?,
                    ],
                )?;

                // Tools menu
                let rotate_left_item = MenuItem::with_id(app, "rotate-left", "Rotate Left", true, Some("CmdOrCtrl+Left"))?;
                let rotate_right_item = MenuItem::with_id(app, "rotate-right", "Rotate Right", true, Some("CmdOrCtrl+Right"))?;
                let add_blank_item = MenuItem::with_id(app, "add-blank", "Add Blank Page", true, Some("CmdOrCtrl+N"))?;
                let delete_pages_item = MenuItem::with_id(app, "delete-pages", "Delete Selected Pages", true, Some("Delete"))?;
                let compress_item = MenuItem::with_id(app, "compress", "Compress PDF", true, None::<&str>)?;
                let ocr_item = MenuItem::with_id(app, "ocr", "Run OCR", true, None::<&str>)?;

                let tools_menu = Submenu::with_items(
                    app,
                    "Tools",
                    true,
                    &[
                        &rotate_left_item,
                        &rotate_right_item,
                        &PredefinedMenuItem::separator(app)?,
                        &add_blank_item,
                        &delete_pages_item,
                        &PredefinedMenuItem::separator(app)?,
                        &compress_item,
                        &ocr_item,
                    ],
                )?;

                // Help menu
                let about_item = MenuItem::with_id(app, "about", "About BentoPDF", true, None::<&str>)?;
                let shortcuts_item = MenuItem::with_id(app, "shortcuts", "Keyboard Shortcuts", true, Some("CmdOrCtrl+/"))?;

                let help_menu = Submenu::with_items(
                    app,
                    "Help",
                    true,
                    &[
                        &shortcuts_item,
                        &PredefinedMenuItem::separator(app)?,
                        &about_item,
                    ],
                )?;

                // Build the menu
                let menu = Menu::with_items(
                    app,
                    &[&file_menu, &edit_menu, &view_menu, &tools_menu, &help_menu],
                )?;

                app.set_menu(menu)?;

                // Handle menu events
                app.on_menu_event(move |app, event| {
                    let window = app.get_webview_window("main");
                    if let Some(win) = window {
                        let _ = win.emit("menu-action", event.id().0.as_str());
                    }
                    log::info!("Menu action: {}", event.id().0);
                });

                // Handle file drop events via window events
                if let Some(main_window) = app.get_webview_window("main") {
                    let window_clone = main_window.clone();
                    main_window.on_window_event(move |event| {
                        if let WindowEvent::DragDrop(drag_drop) = event {
                            match drag_drop {
                                tauri::DragDropEvent::Drop { paths, position: _ } => {
                                    let pdf_paths: Vec<String> = paths
                                        .iter()
                                        .filter(|p| {
                                            p.extension()
                                                .map(|ext| ext.to_string_lossy().to_lowercase() == "pdf")
                                                .unwrap_or(false)
                                        })
                                        .map(|p| p.to_string_lossy().to_string())
                                        .collect();

                                    if !pdf_paths.is_empty() {
                                        log::info!("Files dropped: {:?}", pdf_paths);
                                        let _ = window_clone.emit("file-drop", &pdf_paths);
                                    }
                                }
                                _ => {}
                            }
                        }
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
