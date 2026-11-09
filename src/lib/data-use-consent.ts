const DATA_USE_CONSENT_STORAGE_KEY = "lumino_data_use_consent_version"
const DATA_USE_CONSENT_VERSION = 1

export async function hasDataUseConsent(): Promise<boolean> {
  const stored = await chrome.storage.local.get(DATA_USE_CONSENT_STORAGE_KEY) as Record<string, unknown>
  return stored[DATA_USE_CONSENT_STORAGE_KEY] === DATA_USE_CONSENT_VERSION
}

export async function saveDataUseConsent(): Promise<void> {
  await chrome.storage.local.set({ [DATA_USE_CONSENT_STORAGE_KEY]: DATA_USE_CONSENT_VERSION })
}

export async function resetDataUseConsent(): Promise<void> {
  await chrome.storage.local.remove(DATA_USE_CONSENT_STORAGE_KEY)
}
