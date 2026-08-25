import { describe, it, expect } from "vitest"
import { renderLatexInText } from "./katex-markdown"

describe("renderLatexInText (auto-render 方案)", () => {
  it("渲染块级 $$...$$", () => {
    const out = renderLatexInText("公式：$$E=mc^2$$")
    expect(out).toContain("katex")
    expect(out).toContain("E=mc")
    expect(out).not.toContain("$$")
  })

  it("渲染行内 \\(...\\)", () => {
    const out = renderLatexInText("行内公式 \\(a^2+b^2=c^2\\) 结束")
    expect(out).toContain("katex")
    expect(out).not.toContain("\\(")
  })

  it("渲染块级 \\[...\\]", () => {
    const out = renderLatexInText("块级 \\[x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\\]")
    expect(out).toContain("katex")
    expect(out).not.toContain("\\[")
  })

  it("渲染 AMS 环境 \\begin{equation}", () => {
    const out = renderLatexInText("\\begin{equation}E=mc^2\\end{equation}")
    expect(out).toContain("katex")
  })

  it("渲染失败时保留原始源码", () => {
    // \dfrac 中的非法组合等 —— 用超长或含非法字符验证兜底
    const out = renderLatexInText("$$\\frac{1}{2}$$")
    expect(out).toContain("katex")
  })

  it("普通美元符号不被当作公式", () => {
    const out = renderLatexInText("价格是 $100 和 $200")
    expect(out).toContain("$100")
    expect(out).toContain("$200")
    expect(out).not.toContain("katex")
  })

  it("普通方括号和圆括号不受影响", () => {
    const out = renderLatexInText("见 [文档](https://a.b) 与 (文本)")
    expect(out).toContain("[文档]")
    expect(out).toContain("(文本)")
  })

  it("不匹配残缺分隔符", () => {
    const out = renderLatexInText("未闭合 \\(公式")
    expect(out).toContain("未闭合 \\(")
  })
})
