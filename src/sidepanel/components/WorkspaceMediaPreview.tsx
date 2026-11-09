import { useEffect, useState } from "react"
import { exportWorkspaceFile } from "../../lib/fs/workspace"
import { useW } from "../../lib/workbench/i18n"

export function mediaKind(path: string): "image" | "audio" | "video" | "pdf" | null {
  if (/\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i.test(path)) return "image"
  if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(path)) return "audio"
  if (/\.(mp4|webm|mov)$/i.test(path)) return "video"
  return /\.pdf$/i.test(path) ? "pdf" : null
}

export function WorkspaceMediaPreview({ path }: { path: string }) {
  const w = useW()
  const [url, setUrl] = useState("")
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false, objectUrl = ""
    setUrl(""); setFailed(false)
    void exportWorkspaceFile(path).then(result => {
      if (cancelled) return
      if (!result) { setFailed(true); return }
      objectUrl = URL.createObjectURL(result.blob); setUrl(objectUrl)
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [path])
  if (failed) return <p className="wb-muted">{w("previewUnavailable")}</p>
  if (!url) return <p className="wb-muted">{w("loading")}</p>
  const kind = mediaKind(path)
  return <div className={`wb-media-preview is-${kind}`}>
    {kind === "image" ? <img src={url} alt={path} onError={() => setFailed(true)}/>
      : kind === "audio" ? <audio src={url} controls onError={() => setFailed(true)}/>
      : kind === "video" ? <video src={url} controls onError={() => setFailed(true)}/>
      : <iframe title={path} src={url}/>}
  </div>
}
