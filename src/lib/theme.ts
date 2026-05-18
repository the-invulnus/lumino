/**
 * Lumino Theme Management
 *
 * Theme preference is stored in chrome.storage.sync under key "theme".
 * The <html> element gets data-theme attribute applied by applyTheme().
 * CSS tokens in tokens.css respond to [data-theme="..."] selectors.
 */

export type ThemeName = "paper" | "oryzo" | "fictional"

export const DEFAULT_THEME: ThemeName = "paper"

const THEME_STORAGE_KEY = "theme"

export async function getTheme(): Promise<ThemeName> {
  const data = await chrome.storage.sync.get(THEME_STORAGE_KEY)
  const value = data[THEME_STORAGE_KEY]
  if (value === "paper" || value === "oryzo" || value === "fictional") {
    return value
  }
  return DEFAULT_THEME
}

export async function saveTheme(theme: ThemeName): Promise<void> {
  await chrome.storage.sync.set({ [THEME_STORAGE_KEY]: theme })
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme)
}
