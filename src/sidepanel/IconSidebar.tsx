/**
 * 右侧图标导航栏（HeyGen 风格）
 *
 * 图标 40×40 在上 + 标签文字 11px 在下。
 * 内置 Agent 在前，用户自定义 Agent 在后，设置按钮在底部。
 */

import { type AgentConfig } from "../lib/chat/mode-config"
import type { CSSProperties } from "react"
import { useT } from "../lib/i18n"

/** 导航栏图标组件 — 使用纯 SVG 图标（无需外部依赖） */
function NavIcon({ icon }: { icon: string }) {
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

  switch (icon) {
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

/** 导航栏自身的图标 key 名（与 AgentConfig.icon 不同，这是导航栏内置图标） */
function getIconKey(agent: AgentConfig, isHome: boolean): string {
  if (isHome) return "home"
  if (agent.isBuiltin) return agent.icon
  return "custom"
}

export function IconSidebar({
  agents,
  currentAgentId,
  runningAgentIds,
  onSelectAgent,
  onGoHome,
  onOpenSettings
}: {
  agents: AgentConfig[]
  currentAgentId: string | null   // null = 在首页
  runningAgentIds: Set<string>
  onSelectAgent: (agent: AgentConfig) => void
  onGoHome: () => void
  onOpenSettings: () => void
}) {
  const t = useT()
  return (
    <nav className="lm-icon-sidebar" aria-label={t("nav.ariaLabel")}>
      {/* 首页 */}
      <button
        className={`lm-nav-item${currentAgentId === null ? " lm-nav-item--active" : ""}`}
        title={t("nav.home")}
        onClick={onGoHome}
        type="button"
      >
        <div className="lm-nav-icon-box">
          <NavIcon icon="home" />
        </div>
        <span className="lm-nav-label">{t("nav.home")}</span>
      </button>

      {/* 所有 Agent（内置 + 自定义） */}
      {agents.map((agent) => {
        const isRunning = runningAgentIds.has(agent.id)
        const isActive = currentAgentId === agent.id
        return (
          <button
            key={agent.id}
            className={`lm-nav-item${isActive ? " lm-nav-item--active" : ""}`}
            title={t(agent.name)}
            onClick={() => onSelectAgent(agent)}
            type="button"
            style={{ position: "relative" } as CSSProperties}
          >
            <div className="lm-nav-icon-box">
              <NavIcon icon={getIconKey(agent, false)} />
            </div>
            <span className="lm-nav-label">{t(agent.name)}</span>
            {/* 运行中指示器 */}
            {isRunning && (
              <span className="lm-nav-running-dot" />
            )}
          </button>
        )
      })}

      {/* spacer 推动设置到底部 */}
      <div className="lm-nav-spacer" />

      {/* 设置 */}
      <button
        className="lm-nav-item"
        title={t("nav.settings")}
        onClick={onOpenSettings}
        type="button"
      >
        <div className="lm-nav-icon-box">
          <NavIcon icon="settings" />
        </div>
        <span className="lm-nav-label">{t("nav.settings")}</span>
      </button>
    </nav>
  )
}
