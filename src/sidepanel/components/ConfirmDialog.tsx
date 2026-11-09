import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useW } from "../../lib/workbench/i18n"

type ConfirmOptions = {
  title: string
  message: string
  detail?: string
  warning?: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
}

function ConfirmDialog({ options, onResolve }: { options: ConfirmOptions; onResolve: (confirmed: boolean) => void }) {
  const w = useW()
  const id = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const previousFocus = document.activeElement as HTMLElement | null
    dialog.showModal()
    cancelRef.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  const description = [`${id}-description`, options.detail ? `${id}-detail` : "", options.warning ? `${id}-warning` : ""].filter(Boolean).join(" ")
  return <dialog ref={ref} className="wb-confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={description} aria-modal="true"
    onCancel={event => { event.preventDefault(); onResolve(false) }}
    onKeyDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onResolve(false) }}>
    <div className="wb-confirm-body">
      <h2 id={`${id}-title`}>{options.title}</h2>
      <p id={`${id}-description`}>{options.message}</p>
      {options.detail && <div className="wb-confirm-detail" id={`${id}-detail`}>{options.detail}</div>}
      {options.warning && <p className="wb-confirm-warning" id={`${id}-warning`}>{options.warning}</p>}
      <div className="wb-confirm-actions">
        <button ref={cancelRef} type="button" className="wb-button" onClick={() => onResolve(false)}>{options.cancelLabel || w("cancel")}</button>
        <button type="button" className={`wb-button ${options.destructive ? "wb-button--danger" : "wb-button--primary"}`} onClick={() => onResolve(true)}>{options.confirmLabel}</button>
      </div>
    </div>
  </dialog>
}

/** Resolve only the active request; hiding/unmounting the view cancels pending work. */
export function useConfirmDialog(enabled = true) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const pending = useRef<((confirmed: boolean) => void) | null>(null)
  const mounted = useRef(true)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const resolve = useCallback((confirmed: boolean) => {
    const finish = pending.current
    if (!finish) return
    pending.current = null
    if (mounted.current) setOptions(null)
    finish(confirmed)
  }, [])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; resolve(false) }
  }, [resolve])
  useEffect(() => { if (!enabled) resolve(false) }, [enabled, resolve])
  const confirm = useCallback((request: ConfirmOptions): Promise<boolean> => {
    if (!mounted.current || !enabledRef.current || pending.current) return Promise.resolve(false)
    return new Promise(complete => { pending.current = complete; setOptions(request) })
  }, [])
  return { confirm, confirming: !!options, dialog: options ? <ConfirmDialog options={options} onResolve={resolve}/> : null }
}
