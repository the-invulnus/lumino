import { useState } from "react"
import { exportWorkspaceFile } from "../../lib/fs/workspace"
import { useT } from "../../lib/i18n"

export function LumiToolCall({
  call,
  result
}: {
  call: { id: string; type: "function"; function: { name: string; arguments: string } }
  result: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const hasResult = result !== null
  const t = useT()

  // 检测工具结果是否为错误
  let toolError: string | null = null
  if (hasResult) {
    try {
      const parsed = JSON.parse(result!)
      if (parsed && typeof parsed === "object" && parsed.error) {
        toolError = parsed.error
        if (parsed.message) toolError = `${parsed.error}: ${parsed.message}`
      }
    } catch {
      // 不是 JSON，忽略
    }
  }
  const isReadFileSkill =
    call.function.name === "read_file" &&
    (call.function.arguments || "").includes("SKILL.md")
  const isRunning = !hasResult

  let argsDisplay = call.function.arguments
  try {
    argsDisplay = JSON.stringify(JSON.parse(call.function.arguments), null, 2)
  } catch { /* keep raw */ }

  const handleToggle = () => {
    if (isReadFileSkill || isRunning) return
    setExpanded((prev) => !prev)
  }

  let skillName = ""
  if (isReadFileSkill) {
    const nm = call.function.arguments.match(/"name"\\s*:\\s*"([^"]+)"/)
    const fp = call.function.arguments.match(/"file_path"\\s*:\\s*"([^"]+)"/)
    skillName = nm?.[1] || fp?.[1] || "skill"
  }

  const label = isReadFileSkill
    ? t("toolcall.loadingSkill", { name: skillName })
    : call.function.name

  return (
    <div className={`lumi-tool-call${isReadFileSkill ? " lumi-tool-call--skill" : ""}`}>
      <button
        type="button"
        className={
          "lumi-tool-call__trigger" +
          (expanded ? " lumi-tool-call__trigger--expanded" : "") +
          (isReadFileSkill || isRunning ? " lumi-tool-call__trigger--disabled" : "")
        }
        disabled={isReadFileSkill || isRunning}
        onClick={handleToggle}
      >
        <span
          className={
            "lumi-tool-call__icon" +
            (toolError
              ? " lumi-tool-call__icon--error"
              : hasResult
                ? " lumi-tool-call__icon--ok"
                : isRunning
                  ? " lumi-tool-call__icon--running"
                  : "")
          }
        >
          {isReadFileSkill ? (
            <svg className="lumi-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16.5 9.4 7.55 4.24a1 1 0 0 0-1.45.9v13.72a1 1 0 0 0 1.45.9L16.5 14.6a1 1 0 0 0 0-1.72Z" />
              <line x1="3" x2="3" y1="22" y2="2" />
              <line x1="21" x2="21" y1="22" y2="2" />
            </svg>
          ) : isRunning ? (
            <svg className="lumi-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ) : toolError ? (
            <svg className="lumi-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--lumi-error, #e5484d)" }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="15" x2="9" y1="9" y2="15" />
              <line x1="9" x2="15" y1="9" y2="15" />
            </svg>
          ) : hasResult ? (
            <svg className="lumi-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          ) : (
            <svg className="lumi-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          )}
        </span>
        <span className="lumi-tool-call__name">{label}</span>
        {toolError && (
          <span className="lumi-tool-call__error-badge" title={toolError}>!</span>
        )}
        {isRunning && (
          <span className="lumi-tool-call__running-label">running</span>
        )}
        {!isReadFileSkill && !isRunning && (
          <span className={`lumi-tool-call__chevron${expanded ? " lumi-tool-call__chevron--open" : ""}`}>
            <svg className="lumi-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        )}
      </button>
      {hasResult && (
        <div className={`lumi-tool-call__detail${expanded ? " lumi-tool-call__detail--open" : ""}`}>
          <div className="lumi-tool-call__detail-section">
            <div className="lumi-tool-call__detail-label-row">
              <span className="lumi-tool-call__detail-label">Arguments:</span>
              {(call.function.name === "read_file" || call.function.name === "write_file" || call.function.name === "edit_file") && (() => {
                let filePath: string | null = null
                try {
                  const args = JSON.parse(call.function.arguments)
                  filePath = args.file_path || null
                } catch { /* ignore */ }
                if (!filePath) return null
                return (
                  <button
                    type="button"
                    className="lumi-tool-call__download"
                    title={t("toolcall.download", { path: filePath ?? "" })}
                    onClick={async (e) => {
                      e.stopPropagation()
                      const exported = await exportWorkspaceFile(filePath!)
                      if (!exported) return
                      const url = URL.createObjectURL(exported.blob)
                      const a = document.createElement("a")
                      a.href = url
                      a.download = exported.filename
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" x2="12" y1="15" y2="3" />
                    </svg>
                  </button>
                )
              })()}
            </div>
            <pre>{argsDisplay}</pre>
          </div>
          <div className="lumi-tool-call__detail-section">
            <div className="lumi-tool-call__detail-label">Result:</div>
            <pre className={toolError ? "lumi-tool-call__result--error" : ""}>{result}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
