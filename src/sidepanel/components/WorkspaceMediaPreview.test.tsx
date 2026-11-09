// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { exportWorkspaceFile } from "../../lib/fs/workspace"
import { WorkspaceMediaPreview } from "./WorkspaceMediaPreview"

vi.mock("../../lib/fs/workspace", () => ({ exportWorkspaceFile: vi.fn() }))
vi.mock("../../lib/workbench/i18n", () => ({ useW: () => (key: string) => key }))
let host: HTMLDivElement, root: Root
const createUrl = vi.fn(), revokeUrl = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl })
  createUrl.mockReturnValue("blob:preview")
  vi.mocked(exportWorkspaceFile).mockResolvedValue({ blob: new Blob(["data"]), filename: "file" })
  host = document.createElement("div"); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

it("previews media in place and releases the previous Blob URL when the file changes or closes", async () => {
  await act(async () => root.render(<WorkspaceMediaPreview path="uploads/image.png"/>))
  expect(host.querySelector("img")?.getAttribute("src")).toBe("blob:preview")
  expect(revokeUrl).not.toHaveBeenCalled()
  await act(async () => root.render(<WorkspaceMediaPreview path="uploads/report.pdf"/>))
  expect(revokeUrl).toHaveBeenCalledWith("blob:preview")
  expect(host.querySelector("iframe")?.getAttribute("src")).toBe("blob:preview")
  await act(async () => root.render(<WorkspaceMediaPreview path="uploads/music.mp3"/>))
  expect(host.querySelector("audio")?.hasAttribute("controls")).toBe(true)
  await act(async () => root.render(<WorkspaceMediaPreview path="uploads/movie.mp4"/>))
  expect(host.querySelector("video")?.hasAttribute("controls")).toBe(true)
  act(() => root.render(null))
  expect(revokeUrl).toHaveBeenCalledTimes(4)
})

it("ignores a late read after navigation and provides a fallback when a media file is unavailable", async () => {
  let finish!: (value: { blob: Blob; filename: string }) => void
  vi.mocked(exportWorkspaceFile).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await act(async () => root.render(<WorkspaceMediaPreview path="old.png"/>))
  vi.mocked(exportWorkspaceFile).mockResolvedValue(null)
  await act(async () => root.render(<WorkspaceMediaPreview path="missing.png"/>))
  await act(async () => finish({ blob: new Blob(), filename: "old.png" }))
  expect(createUrl).not.toHaveBeenCalled()
  expect(host.textContent).toContain("previewUnavailable")
  expect(host.querySelector("img")).toBeNull()
})
