# Privacy Policy for Lumino

**Last updated: 2026-07-29**

## Overview

Lumino is a Chrome browser extension that provides an AI assistant interface in your browser's side panel. This privacy policy explains what data Lumino handles and how it is managed.

## Data Collection

**Lumino does not collect, transmit, or store any user data on external servers controlled by the developer.** All data processing happens locally within your browser or on servers you explicitly configure.

## What Data Is Stored Locally

The following data is stored entirely within your browser and is never sent to the developer:

| Data | Storage Location | Synced to Google? |
|---|---|---|
| LLM API Key | `chrome.storage.local` | No |
| LLM Base URL | `chrome.storage.local` | No |
| LLM Model Name | `chrome.storage.local` | No |
| Obsidian API Key | `chrome.storage.local` | No |
| Obsidian Base URL | `chrome.storage.local` | No |
| Chat History (messages, threads) | IndexedDB (local) | No |
| File Workspace (OPFS) | Origin Private File System (local) | No |
| UI Preferences (theme, locale) | `chrome.storage.local` / `chrome.storage.sync` | Theme only |
| Custom Agent Configurations | `chrome.storage.sync` | Yes |

**Sensitive credentials** (API keys, tokens) are stored in `chrome.storage.local` and are **never** synced to your Google account, minimizing exposure if your account is compromised.

## Third-Party Services

Lumino sends API requests to **your own configured LLM provider** (OpenAI-compatible API endpoint). The extension acts as a client — you control which service receives your requests.

When Obsidian integration is enabled, the extension communicates with your locally running Obsidian instance via the Local REST API plugin (`http://127.0.0.1:27123` by default). This traffic never leaves your machine.

## Permissions Explained

| Permission | Why It's Needed |
|---|---|
| `sidePanel` | To open the assistant interface in Chrome's side panel |
| `storage` | To save your settings, preferences, and custom agents locally |
| `tabs` | To interact with browser tabs for tools like navigation, screenshots, and page reading |
| `scripting` | To execute tools (e.g., DOM inspection, form filling) on web pages you interact with |
| `downloads` | To export files from the built-in file workspace to your computer |
| `alarms` | To schedule periodic cleanup of large cached tool results |
| `host_permissions: <all_urls>` | To allow the floating button and content scripts to work on any page you visit, and to enable web browsing tools to read page content |

## Data Deletion

All locally stored data can be cleared by:
- Removing the extension via `chrome://extensions`
- Or manually clearing extension storage in Chrome's site data settings

## Changes to This Policy

We may update this privacy policy from time to time. We will notify you of any changes by posting the new privacy policy on this page.

## Contact

If you have questions about this privacy policy, please open an issue on our GitHub repository.
