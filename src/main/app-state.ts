/** Shared flag so the tray/menu/updater can request a real quit
 * while the window's close button only hides to tray. */
export const appState = { quitting: false }
