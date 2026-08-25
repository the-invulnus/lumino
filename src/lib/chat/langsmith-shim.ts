// Browser-compatible shim for langsmith.
// langsmith is a Node.js tracing library that uses `node:fs` — not available in browser extensions.
// This shim provides no-op stubs to prevent build errors in the extension environment.

export class Client {
  constructor(..._args: unknown[]) {}
  async createRun(..._args: unknown[]): Promise<Record<string, unknown>> {
    return {}
  }
  async updateRun(..._args: unknown[]): Promise<Record<string, unknown>> {
    return {}
  }
  async createProject(..._args: unknown[]): Promise<Record<string, unknown>> {
    return {}
  }
}

export class RunTree {
  constructor(..._args: unknown[]) {}
  async postRun(..._args: unknown[]): Promise<void> {}
  async end(..._args: unknown[]): Promise<void> {}
  async createChild(..._args: unknown[]): Promise<RunTree> {
    return new RunTree()
  }
}

export function traceable<T extends (...args: unknown[]) => unknown>(
  fn: T
): T {
  return fn
}

// Stub exports for any additional langsmith modules
export const __esModule = true
export default { Client, RunTree, traceable }
