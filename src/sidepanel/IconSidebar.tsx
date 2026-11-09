/**
 * 右侧图标导航栏（HeyGen 风格）
 *
 * 图标 40×40 在上 + 标签文字 11px 在下。
 * 功能入口在上，历史与设置在底部；复用原有导航样式。
 */

import { useT } from "../lib/i18n"

/** 导航栏图标组件 — 使用纯 SVG 图标（无需外部依赖） */
function NavIcon({ icon }: { icon: string }) {
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

  switch (icon) {
    case "file":
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>
    case "table":
      return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12M3 15h18"/></svg>
    case "folder":
      return <svg {...props}><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
    case "history":
      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>
    case "home":
      return (
        <svg {...props}>
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
      )
    case "chat":
      return (
        <svg {...props}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
    case "research":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
          <path d="M8 11h6M11 8v6" />
        </svg>
      )
    case "replicate":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8.5" cy="10" r="2" />
          <path d="M3 16l5-5 3 3 4-4 6 6" />
        </svg>
      )
    case "automate":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      )
    case "settings":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    // 用户自定义 Agent 使用通用图标
    case "custom":
    default:
      return (
        <svg {...props}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M8 10h.01M12 10h.01M16 10h.01" />
        </svg>
      )
  }
}

/** 导出 NavIcon 供 options.tsx 使用 */
export { NavIcon }

/** SVG 图标列表（供 options.tsx 图标选择器使用） */
export const AVAILABLE_ICONS = [
  "chat", "research", "replicate", "automate",
  "home", "settings", "custom"
]

export type SidebarItem = { id: string; label: string; title?: string; icon: string; running?: boolean }

export function IconSidebar({
  items,
  currentView,
  onSelect,
  onOpenHistory,
  onOpenSettings
}: {
  items: SidebarItem[]
  currentView: string
  onSelect: (id: string) => void
  onOpenHistory: () => void
  onOpenSettings: () => void
}) {
  const t = useT()
  return (
    <nav className="lm-icon-sidebar" aria-label={t("nav.ariaLabel")}>
      {items.map((item) => (
        <button
          key={item.id}
          className={`lm-nav-item${currentView === item.id ? " lm-nav-item--active" : ""}`}
          aria-current={currentView === item.id ? "page" : undefined}
          aria-label={item.title || item.label}
          title={item.title || item.label}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          <div className="lm-nav-icon-box"><NavIcon icon={item.icon} /></div>
          <span className="lm-nav-label">{item.label}</span>
          {item.running && <span className="lm-nav-running-dot" />}
        </button>
      ))}
      <div className="lm-nav-spacer" />
      <button className="lm-nav-item" title={t("chat.tooltip.history")} aria-label={t("chat.tooltip.history")} onClick={onOpenHistory} type="button">
        <div className="lm-nav-icon-box"><NavIcon icon="history" /></div>
      </button>
      <button className="lm-nav-item" title={t("nav.settings")} onClick={onOpenSettings} type="button">
        <div className="lm-nav-icon-box"><NavIcon icon="settings" /></div>
        <span className="lm-nav-label">{t("nav.settings")}</span>
      </button>
    </nav>
  )
}
