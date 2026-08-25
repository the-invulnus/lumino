/**
 * Lumino Theme — 始终使用 paper（暖调编辑）
 */

export type ThemeName = "paper"

export function getTheme(): ThemeName {
  return "paper"
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme)
}
