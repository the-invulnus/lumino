import { useState } from "react"
import { useT } from "../../lib/i18n"

/**
 * 推理过程（reasoning content）展示区块。
 *
 * 轻量引用样式：斜体淡色文字 + 左侧竖线，默认收起，点击展开。
 * 纯文本预格式化展示，不做 Markdown/LaTeX 解析。
 */
export function ReasoningBlock({ content }: { content: string }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="lumi-reasoning">
      <button
        type="button"
        className="lumi-reasoning__trigger"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span className="lumi-reasoning__icon" aria-hidden>
          <svg
            className="lumi-icon-sm"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l1.9 5.7a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" />
          </svg>
        </span>
        <span className="lumi-reasoning__name">{t("reasoning.title")}</span>
        <span
          className={`lumi-reasoning__chevron${expanded ? " lumi-reasoning__chevron--open" : ""}`}
          aria-hidden
        >
          <svg
            className="lumi-icon-xs"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </button>
      {expanded && <pre className="lumi-reasoning__detail">{content}</pre>}
    </div>
  )
}
