use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, Emitter,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            // Setup logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Create native menu bar
            let app_handle = app.handle();

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
            let app_handle_menu = app_handle.clone();
            app.on_menu_event(move |app, event| {
                let window = app.get_webview_window("main");
                if let Some(win) = window {
                    // Emit event to frontend
                    let _ = win.emit("menu-action", event.id().0.as_str());
                }

                // Log the menu action
                log::info!("Menu action: {}", event.id().0);
            });

            // Handle file drop events
            let main_window = app.get_webview_window("main").unwrap();
            main_window.on_drag_drop_event(move |event| {
                match event {
                    tauri::DragDropEvent::Drop { paths, position: _ } => {
                        // Filter for PDF files
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
                            // This will be handled by the frontend
                        }
                    }
                    _ => {}
                }
                true // Don't prevent default behavior
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
