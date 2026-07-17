/**
 * 首页 — 功能卡片网格 + 快捷入口
 */

import { useState, useEffect } from "react"
import type { AgentConfig } from "../lib/chat/mode-config"
import type { ChatThreadRecord } from "../lib/chat/thread-idb"
import { listThreads } from "../lib/chat/thread-idb"
import { suggestTitleFromMessages } from "../lib/chat/thread-idb"
import blackCatGif from "data-base64:~black_cat.gif"

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

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return "刚刚"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return new Date(ts).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
}

export function HomePage({
  agents,
  onSelectAgent
}: {
  agents: AgentConfig[]
  onSelectAgent: (agent: AgentConfig) => void
}) {
  const [recentThreads, setRecentThreads] = useState<ChatThreadRecord[]>([])

  useEffect(() => {
    listThreads().then((rows) => {
      setRecentThreads(rows.filter(r => r.messages.length > 0).slice(0, 3))
    }).catch(() => {})
  }, [])

  return (
    <div className="lm-home-page">
      {/* Hero */}
      <div className="lm-home-hero">
        <img
          aria-hidden
          className="lm-home-hero-avatar"
          src={blackCatGif}
          alt="Lumi"
        />
        <h1 className="lm-home-hero-title">Lumi Knows</h1>
        <p className="lm-home-hero-sub">你的浏览器智能助手</p>
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
                <span className="lm-home-card-name">{agent.name}</span>
                <span className="lm-home-card-desc">{agent.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Quick prompts */}
      <div className="lm-home-section">
        <h3 className="lm-home-section-title">试试这些</h3>
        <div className="lm-home-prompts">
          <button className="lm-home-prompt-chip" onClick={() => {
            const chat = agents.find(a => a.id === "chat")
            if (chat) onSelectAgent(chat)
          }}>
            总结当前网页的主要内容
          </button>
          <button className="lm-home-prompt-chip" onClick={() => {
            const research = agents.find(a => a.id === "research")
            if (research) onSelectAgent(research)
          }}>
            搜索最近AI领域的新进展
          </button>
          <button className="lm-home-prompt-chip" onClick={() => {
            const replicate = agents.find(a => a.id === "replicate")
            if (replicate) onSelectAgent(replicate)
          }}>
            帮我分析这个页面的设计风格
          </button>
          <button className="lm-home-prompt-chip" onClick={() => {
            const automate = agents.find(a => a.id === "automate")
            if (automate) onSelectAgent(automate)
          }}>
            自动填写当前页面的表单
          </button>
        </div>
      </div>

      {/* Recent threads */}
      {recentThreads.length > 0 && (
        <div className="lm-home-section">
          <h3 className="lm-home-section-title">最近会话</h3>
          <div className="lm-home-recent">
            {recentThreads.map((t) => (
              <button
                key={t.id}
                className="lm-home-recent-item"
                onClick={() => {
                  const agent = agents.find(a => a.id === t.mode)
                  if (agent) onSelectAgent(agent)
                }}
                type="button"
              >
                <span className="lm-home-recent-title">
                  {t.title || suggestTitleFromMessages(t.messages) || "会话"}
                </span>
                <span className="lm-home-recent-time">{formatTime(t.updatedAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
