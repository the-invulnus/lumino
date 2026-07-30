/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OPEN_SIDE_PANEL_MESSAGE } from "../lib/side-panel-bridge"
import {
  createFloatingButton,
  FLOATING_BUTTON_ID,
  mountFloatingButton
} from "./floating-button"

describe("floating button", () => {
  const sendMessage = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    document.body.innerHTML = ""
    document.body.removeAttribute("style")
    sendMessage.mockClear()
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessage,
        onMessage: { addListener: vi.fn() }
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async () => undefined
        },
        sync: {
          get: (_key: string, cb: (data: Record<string, unknown>) => void) =>
            cb({})
        },
        onChanged: { addListener: vi.fn() }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("creates a Lumino fab", () => {
    const button = createFloatingButton(document)

    expect(button.id).toBe(FLOATING_BUTTON_ID)
    expect(button.className).toContain("lumino-fab")
    expect(button.getAttribute("aria-label")).toBe("Open Lumino side panel")
    expect(button.querySelector(".lumino-fab__img")).not.toBeNull()
  })

  it("mounts only one button when called repeatedly", () => {
    const firstButton = mountFloatingButton(document)
    const secondButton = mountFloatingButton(document)

    expect(secondButton).toBe(firstButton)
    expect(document.querySelectorAll(`#${FLOATING_BUTTON_ID}`)).toHaveLength(1)
  })

  it("asks the extension to open the same Side Panel as the toolbar icon", () => {
    const button = mountFloatingButton(document)

    button.click()

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith({
      type: OPEN_SIDE_PANEL_MESSAGE
    })
  })
})
