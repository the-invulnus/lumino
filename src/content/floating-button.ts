import {
  OPEN_SIDE_PANEL_MESSAGE,
  type OpenSidePanelMessage
} from "../lib/side-panel-bridge"

export const FLOATING_BUTTON_ID = "lumino-floating-button"

function requestOpenSidePanel() {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return
  }

  const message: OpenSidePanelMessage = {
    type: OPEN_SIDE_PANEL_MESSAGE
  }

  void chrome.runtime.sendMessage(message)
}

export function createFloatingButton(ownerDocument: Document) {
  const button = ownerDocument.createElement("button")
  const glyph = ownerDocument.createElement("span")

  button.id = FLOATING_BUTTON_ID
  button.type = "button"
  button.className = "lumino-fab"
  button.setAttribute("aria-label", "打开 Lumino 侧边栏")

  glyph.className = "lumino-fab__glyph"
  glyph.textContent = "L"
  glyph.setAttribute("aria-hidden", "true")

  button.append(glyph)

  return button
}

export function mountFloatingButton(ownerDocument: Document = document) {
  const existingButton = ownerDocument.getElementById(FLOATING_BUTTON_ID)

  if (existingButton instanceof HTMLButtonElement) {
    return existingButton
  }

  const button = createFloatingButton(ownerDocument)
  button.addEventListener("click", requestOpenSidePanel)

  ownerDocument.body.append(button)

  return button
}
