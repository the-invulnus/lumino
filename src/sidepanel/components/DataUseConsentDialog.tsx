import { useEffect, useId, useRef } from "react"
import { useW } from "../../lib/workbench/i18n"

export function DataUseConsentDialog({ open, onAccept, onCancel }: {
  open: boolean
  onAccept: () => void
  onCancel: () => void
}) {
  const w = useW()
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const previousFocus = document.activeElement as HTMLElement | null
    dialog.showModal()
    cancelRef.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])

  if (!open) return null

  return <dialog
    ref={dialogRef}
    className="wb-confirm-dialog wb-data-use-dialog"
    aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-intro ${id}-details ${id}-note`}
    aria-modal="true"
    onCancel={event => { event.preventDefault(); onCancel() }}
    onKeyDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onCancel() }}
  >
    <div className="wb-confirm-body wb-data-use-body">
      <h2 id={`${id}-title`}>{w("dataUseTitle")}</h2>
      <p id={`${id}-intro`}>{w("dataUseIntro")}</p>
      <ul id={`${id}-details`} className="wb-data-use-list">
        <li>{w("dataUseChat")}</li>
        <li>{w("dataUsePages")}</li>
        <li>{w("dataUseFiles")}</li>
        <li>{w("dataUseServices")}</li>
      </ul>
      <p id={`${id}-note`} className="wb-data-use-note">{w("dataUseNote")}</p>
      <div className="wb-confirm-actions">
        <button ref={cancelRef} type="button" className="wb-button" onClick={onCancel}>{w("dataUseCancel")}</button>
        <button type="button" className="wb-button wb-button--primary" onClick={onAccept}>{w("dataUseAgree")}</button>
      </div>
    </div>
  </dialog>
}
