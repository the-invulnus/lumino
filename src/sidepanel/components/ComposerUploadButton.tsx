import { useRef } from "react"
import { useT } from "../../lib/i18n"

export function ComposerUploadButton({ busy, disabled, onUpload }: {
  busy: boolean
  disabled: boolean
  onUpload: (files: File[]) => void
}) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const label = t(busy ? "chat.uploadingFiles" : "chat.uploadFiles")
  return <>
    <input ref={input} type="file" multiple hidden disabled={disabled || busy} onChange={event => {
      const files = Array.from(event.currentTarget.files ?? [])
      event.currentTarget.value = ""
      if (files.length) onUpload(files)
    }} />
    <button type="button" className="wb-composer-icon-button" title={label} aria-label={label} aria-busy={busy} disabled={disabled || busy} onClick={() => input.current?.click()}>
      {busy ? <svg className="wb-upload-spinner" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-9-9" /></svg> : <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
    </button>
  </>
}
