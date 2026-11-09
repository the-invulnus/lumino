import { afterEach, expect, it, vi } from "vitest"
import { writeWorkspaceFileBytes } from "../../fs/workspace"
import { handleScreenshot } from "./browser-tools"

vi.mock("../../fs/workspace", () => ({ writeWorkspaceFileBytes: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it("stores new screenshots as binary files in the built-in screenshots directory", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1793940000000)
  vi.stubGlobal("chrome", { tabs: {
    get: vi.fn().mockResolvedValue({ id: 7, windowId: 2 }),
    captureVisibleTab: vi.fn().mockResolvedValue("data:image/png;base64,AP+A")
  } })
  const result = JSON.parse(await handleScreenshot({ tab_id: 7, format: "png" }))
  expect(result.saved_to).toBe("/screenshots/screenshot_1793940000000_tab7.png")
  expect(writeWorkspaceFileBytes).toHaveBeenCalledWith(result.saved_to, new Uint8Array([0, 255, 128]))
  expect(result.size_bytes).toBe(3)
})
