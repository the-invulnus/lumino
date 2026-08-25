/**
 * 首页 — 功能卡片网格 + 快捷入口
 */

import { useState, useEffect } from "react"
import type { AgentConfig } from "../lib/chat/mode-config"
import type { ChatThreadRecord } from "../lib/chat/thread-idb"
import { listThreads } from "../lib/chat/thread-idb"
import { NavIcon } from "./IconSidebar"
import { useT } from "../lib/i18n"
import { formatHistoryDate } from "../lib/format-time"
import lumiIcon from "data-base64:~lumi.png"

function CardIcon({ icon }: { icon: string }) {
  const props = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  switch (icon) {
    case "chat": return (<svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>)
    case "research": return (<svg {...props}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M8 11h6M11 8v6" /></svg>)
    case "replicate": return (<svg {...props}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="10" r="2" /><path d="M3 16l5-5 3 3 4-4 6 6" /></svg>)
    case "automate": return (<svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>)
    default: return (<svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></svg>)
  }
}

export function HomePage({
  agents,
  refreshToken,
  onSelectAgent,
  onSelectThread,
  onOpenHistory
}: {
  agents: AgentConfig[]
  refreshToken?: number
  onSelectAgent: (agent: AgentConfig) => void
  onSelectThread: (threadId: string) => void
  onOpenHistory: () => void
}) {
  const [recentThreads, setRecentThreads] = useState<ChatThreadRecord[]>([])

  const t = useT()

  useEffect(() => {
    listThreads().then((rows) => {
      setRecentThreads(rows.filter(r => r.messages.length > 0).slice(0, 6))
    }).catch(() => {})
  }, [refreshToken])

  return (
    <div className="lm-home-page">
      {/* Hero */}
      <div className="lm-home-hero">
        <img
          aria-hidden
          className="lm-home-hero-avatar"
          src={lumiIcon}
          alt="Lumi"
        />
        <h1 className="lm-home-hero-title">Lumi Knows</h1>
        <p className="lm-home-hero-tagline">{t("home.tagline")}</p>
      </div>

      {/* Agent cards */}
      <div className="lm-home-section">
        <div className="lm-home-grid">
          {agents.map((agent) => (
            <button
              key={agent.id}
              className="lm-home-card"
              onClick={() => onSelectAgent(agent)}
              type="button"
            >
              <div className="lm-home-card-icon">
                <CardIcon icon={agent.isBuiltin ? agent.icon : "custom"} />
              </div>
              <div className="lm-home-card-body">
                <span className="lm-home-card-name">{t(agent.name)}</span>
                <span className="lm-home-card-desc">{t(agent.description)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent threads */}
      {recentThreads.length > 0 && (
        <div className="lm-home-section">
          <div className="lm-home-section-head">
            <h3 className="lm-home-section-title">{t("home.recent")}</h3>
            <button
              className="lm-home-history-btn"
              title={t("home.historyTooltip")}
              onClick={onOpenHistory}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
          </div>
          <div className="lm-home-recent">
            {recentThreads.map((thread) => {
              const agent = agents.find(a => a.id === thread.mode)
              return (
                <button
                  key={thread.id}
                  className="lm-home-recent-item"
                  onClick={() => onSelectThread(thread.id)}
                  type="button"
                >
                  {agent && (
                    <span className="lm-home-recent-icon" title={t(agent.name)}>
                      <NavIcon icon={agent.isBuiltin ? agent.icon : "custom"} />
                    </span>
                  )}
                  <span className="lm-home-recent-title">
                    {thread.title || t("thread.defaultTitle")}
                  </span>
                  <span className="lm-home-recent-time">{formatHistoryDate(thread.updatedAt)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
