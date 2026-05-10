/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OPEN_SIDE_PANEL_MESSAGE } from "../lib/side-panel-bridge"
import { FLOATING_BUTTON_ID, createFloatingButton, mountFloatingButton } from "./floating-button"

describe("floating button", () => {
  const sendMessage = vi.fn()

  beforeEach(() => {
    document.body.innerHTML = ""
    document.body.removeAttribute("style")
    sendMessage.mockClear()
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessage
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
    expect(button.getAttribute("aria-label")).toBe("打开 Lumino 侧边栏")
    expect(button.textContent).toContain("L")
    expect(button.querySelector(".lumino-fab__glyph")).not.toBeNull()
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
