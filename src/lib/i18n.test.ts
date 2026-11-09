// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("language preferences", () => {
  const get = vi.fn()
  const set = vi.fn()
  const getUILanguage = vi.fn()
  let storageChanged: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void

  beforeEach(() => {
    vi.resetModules()
    get.mockReset().mockResolvedValue({})
    set.mockReset().mockResolvedValue(undefined)
    getUILanguage.mockReset().mockReturnValue("zh-CN")
    document.documentElement.lang = ""
    vi.stubGlobal("chrome", {
      i18n: { getUILanguage },
      storage: {
        local: { get, set },
        onChanged: { addListener: (listener: typeof storageChanged) => { storageChanged = listener } }
      }
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it("starts in Chinese and sets the document language on a fresh installation", async () => {
    const i18n = await import("./i18n")
    expect(i18n.getLocale()).toBe("zh")
    expect(await i18n.initLocaleFromStorage()).toBe("zh")
    expect(document.documentElement.lang).toBe("zh-CN")
    expect(set).not.toHaveBeenCalled()
  })

  it("preserves an existing English preference", async () => {
    get.mockResolvedValue({ lumino_locale: "en" })
    const i18n = await import("./i18n")
    expect(await i18n.initLocaleFromStorage()).toBe("en")
    expect(i18n.getLocale()).toBe("en")
    expect(document.documentElement.lang).toBe("en")
    expect(set).not.toHaveBeenCalled()
  })

  it.each(["zh", "zh-CN", "zh-TW", "zh-HK", "zh-Hant"])("uses Chinese for the %s browser language", async language => {
    getUILanguage.mockReturnValue(language)
    const i18n = await import("./i18n")
    expect(i18n.getLocale()).toBe("zh")
    expect(await i18n.initLocaleFromStorage()).toBe("zh")
  })

  it.each(["en-US", "en-GB", "ja", "de"])("uses English for the %s browser language", async language => {
    getUILanguage.mockReturnValue(language)
    const i18n = await import("./i18n")
    expect(i18n.getLocale()).toBe("en")
    expect(await i18n.initLocaleFromStorage()).toBe("en")
    expect(document.documentElement.lang).toBe("en")
  })

  it("preserves a saved Chinese preference in an English browser", async () => {
    getUILanguage.mockReturnValue("en-US")
    get.mockResolvedValue({ lumino_locale: "zh" })
    const i18n = await import("./i18n")
    expect(await i18n.initLocaleFromStorage()).toBe("zh")
    expect(set).not.toHaveBeenCalled()
  })

  it("keeps manual language switching synchronized between extension pages", async () => {
    const i18n = await import("./i18n")
    await i18n.setStoredLocale("en")
    expect(set).toHaveBeenCalledWith({ lumino_locale: "en" })
    storageChanged({ lumino_locale: { newValue: "en" } }, "local")
    expect(i18n.getLocale()).toBe("en")
    storageChanged({ lumino_locale: { newValue: "zh" } }, "local")
    expect(i18n.getLocale()).toBe("zh")
    expect(document.documentElement.lang).toBe("zh-CN")
  })

  it("uses Chinese when the saved preference is invalid or unavailable", async () => {
    const i18n = await import("./i18n")
    get.mockResolvedValue({ lumino_locale: "invalid" })
    expect(await i18n.initLocaleFromStorage()).toBe("zh")
    get.mockRejectedValue(new Error("storage unavailable"))
    expect(await i18n.initLocaleFromStorage()).toBe("zh")
  })
})
