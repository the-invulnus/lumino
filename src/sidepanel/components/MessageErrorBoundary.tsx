import { Component, type ReactNode } from "react"

/**
 * 轻量级消息级 ErrorBoundary，确保单个消息渲染崩溃不会导致整个
 * ChatView 白屏。捕获后显示一条红色错误 placeholder。
 */
export class MessageErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.warn("[lumino] 消息渲染崩溃:", error.message)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="lm-chat-row lm-chat-row--assistant"
          style={{ color: "var(--lumi-danger, #e53e3e)", padding: "8px 16px", fontSize: "13px" }}
        >
          ⚠️ 消息渲染失败
        </div>
      )
    }
    return this.props.children
  }
}
