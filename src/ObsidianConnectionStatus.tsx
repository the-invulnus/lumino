import { useEffect, useState } from "react"
import { useT } from "./lib/i18n"
import { isObsidianConfigured, type ObsidianSettings } from "./lib/settings"
import { testObsidianConnection } from "./lib/obsidian-connection"

type CheckResult = { settings: ObsidianSettings; count?: number; error?: string }

export function ObsidianConnectionStatus({ settings }: { settings: ObsidianSettings }) {
  const t = useT()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<CheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const configured = isObsidianConfigured(settings)

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setChecking(configured)
    if (!configured) return
    // 编辑地址、Key 时稍作等待，忽略过时请求的结果。
    const timer = setTimeout(async () => {
      try {
        const count = await testObsidianConnection(settings)
        if (!cancelled) setResult({ settings, count })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const safeMessage = settings.apiKey.trim()
          ? message.split(settings.apiKey.trim()).join("[redacted]")
          : message
        if (!cancelled) setResult({ settings, error: safeMessage })
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [settings, configured, attempt])

  const current = result?.settings === settings ? result : null
  const state = !settings.enabled ? "disabled"
    : !configured ? "incomplete"
    : !current || checking ? "checking"
    : current.error ? "failed"
    : current.count === 0 ? "empty"
    : "connected"

  return (
    <div className="lm-obsidian-connection" data-state={state}>
      <div className="lm-obsidian-connection__row">
        <div role="status" aria-live="polite">
          <span className="lm-obsidian-connection__dot" aria-hidden="true" />
          <strong>{t(`option.obsidian.connection.${state}`, { count: current?.count ?? 0 })}</strong>
        </div>
        <button className="lm-secondary-button" type="button" disabled={!configured || state === "checking"} onClick={() => setAttempt((value) => value + 1)}>
          {t("option.obsidian.connection.test")}
        </button>
      </div>
      {state === "failed" && <p className="lm-obsidian-connection__error">{current?.error}</p>}
      <p className="lm-obsidian-connection__hint">{t("option.obsidian.connection.hint")}</p>
    </div>
  )
}
