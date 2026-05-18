# Lumino Theme System

三主题架构：通过 CSS 自定义属性（`--lumi-*` tokens）+ `data-theme` 属性切换整套视觉系统。

## 架构概览

```
src/styles/
  tokens.css        ← 每主题的 Token 值定义（颜色/字体/圆角/阴影/渐变）
  layout.css        ← 纯结构样式（display/flex/position/z-index），永不随主题变化
  components.css    ← 组件视觉样式，全部引用 --lumi-* Token
  content-inject.css ← 内容脚本悬浮按钮，Token 作用域在按钮上
```

**切换机制**：`<html data-theme="paper|oryzo|fictional">` 由 `src/lib/theme.ts` 中的 `applyTheme()` 设置。CSS 使用 `:root[data-theme="X"]` 选择器匹配。

## Token 参考

### 颜色

| Token | 作用 |
|-------|------|
| `--lumi-bg` | 页面主背景 |
| `--lumi-bg-deep` | 更深背景（代码块底色、折叠面板） |
| `--lumi-surface` | 半透明表面（bezel 内层） |
| `--lumi-surface-raised` | 浮起表面（input 背景、toggle 背景） |
| `--lumi-surface-solid` | 纯色表面（solid 按钮、侧导航激活态） |
| `--lumi-text` | 主文字色 |
| `--lumi-text-soft` | 次要文字（辅助标签、placeholder） |
| `--lumi-text-faint` | 淡文字（hint、图标色、meta 信息） |
| `--lumi-border` | 边框色（分割线、卡片边） |
| `--lumi-border-strong` | 强调边框（输入框边框、按钮边框） |
| `--lumi-accent-a` | 主强调色（tool-call 运行态、running 指示器、checkbox 勾选） |
| `--lumi-accent-b` | 副强调色（链接、代码引用、markdown 引用线） |
| `--lumi-accent-mist` | 第三强调色（雾色光斑） |
| `--lumi-blob-a` | 光斑 A 颜色 |
| `--lumi-blob-b` | 光斑 B 颜色 |
| `--lumi-blob-c` | 光斑 C 颜色 |
| `--lumi-warn-bg` | 警告背景 |
| `--lumi-warn-border` | 警告边框 |
| `--lumi-warn-text` | 警告文字 |
| `--lumi-danger-bg` | 错误背景 |
| `--lumi-danger-border` | 错误边框 |
| `--lumi-danger-text` | 错误文字 |
| `--lumi-success` | 成功色（tool-call ok态） |
| `--lumi-composer-send-shadow` | 发送按钮阴影 |

### 渐变

| Token | 作用 |
|-------|------|
| `--lumi-gradient-accent` | 发送按钮、主按钮的渐变背景 |
| `--lumi-gradient-accent-subtle` | 用户气泡的淡渐变背景 |
| `--lumi-gradient-note` | 提示 note 卡片背景 |
| `--lumi-gradient-bezel` | Options 页 bezel 外层背景 |

### 字体

| Token | 作用 |
|-------|------|
| `--lumi-font` | 主字体栈（正文、标题、按钮等所有 UI 文字） |
| `--lumi-mono` | 等宽字体栈（代码、tool-call名称、badge） |

### 圆角

| Token | 作用 |
|-------|------|
| `--lumi-radius-outer` | bezel 外层圆角 |
| `--lumi-radius-inner` | bezel 内层圆角、按钮圆角 |
| `--lumi-radius-field` | 输入框、toggle 卡片、tab 组、collapse 面板圆角 |

### 阴影

| Token | 作用 |
|-------|------|
| `--lumi-shadow-card` | 卡片/bezel 的投影 |
| `--lumi-shadow-soft` | 柔投影（logo、logo-cat、tab激活态） |

### 缓动

| Token | 作用 |
|-------|------|
| `--lumi-ease-spring` | 全局缓动函数 |

## 新增主题步骤

假设要新增一个名为 `"neobrut"` 的主题：

### 第一步：在 `tokens.css` 添加 Token 块

```css
/* ===== NEOBRUT: 粗野新潮 ===== */
:root[data-theme="neobrut"] {
  color-scheme: light;

  --lumi-bg: #ffffff;
  --lumi-bg-deep: #f0f0f0;
  --lumi-surface: #ffffff;
  --lumi-surface-raised: #f5f5f5;
  --lumi-surface-solid: #ffffff;
  --lumi-text: #000000;
  --lumi-text-soft: #555555;
  --lumi-text-faint: #999999;
  --lumi-border: #000000;
  --lumi-border-strong: #000000;
  --lumi-accent-a: #ff6b35;
  --lumi-accent-b: #0047ab;
  --lumi-accent-mist: #ffd700;
  --lumi-blob-a: #ff6b35;
  --lumi-blob-b: #ffd700;
  --lumi-blob-c: #0047ab;
  --lumi-warn-bg: #fff3cd;
  --lumi-warn-border: #ffc107;
  --lumi-warn-text: #856404;
  --lumi-danger-bg: #f8d7da;
  --lumi-danger-border: #dc3545;
  --lumi-danger-text: #721c24;
  --lumi-success: #28a745;
  --lumi-composer-send-shadow: 4px 4px 0 #000000;

  --lumi-gradient-accent: none;
  --lumi-gradient-accent-subtle: #fff3e0;
  --lumi-gradient-note: #fffde7;
  --lumi-gradient-bezel: #ffffff;

  --lumi-font: "Your Font", ui-sans-serif, system-ui, sans-serif;
  --lumi-mono: "SF Mono", ui-monospace, Menlo, monospace;

  --lumi-radius-outer: 0px;
  --lumi-radius-inner: 0px;
  --lumi-radius-field: 0px;

  --lumi-shadow-card: 4px 4px 0 #000000;
  --lumi-shadow-soft: 6px 6px 0 #000000;

  --lumi-ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
}
```

如果需要 dark mode：用 `@media (prefers-color-scheme: dark)` 包裹 dark 值（参考 paper 的 dark 块）。

### 第二步：注册主题名称

在 `src/lib/theme.ts` 中：

```typescript
export type ThemeName = "paper" | "oryzo" | "fictional" | "neobrut"
```

并在 `getTheme()` 中添加验证：

```typescript
if (value === "paper" || value === "oryzo" || value === "fictional" || value === "neobrut") {
  return value
}
```

### 第三步：在配置 UI 添加选项

在 `src/options.tsx` 的 `themeLabels` 中添加：

```typescript
neobrut: { name: "粗野新潮", desc: "黑白分明，硬阴影，高对比" }
```

### 可选：content-inject.css

如果悬浮按钮在主题下有显著差异（如阴影风格不同），在 `content-inject.css` 中追加：

```css
#lumino-floating-button.lumino-fab[data-theme="neobrut"] {
  --lumi-fab-accent-a: #ff6b35;
  --lumi-fab-accent-b: #0047ab;
  --lumi-fab-ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
  --lumi-fab-shadow: 4px 4px 0 rgba(0,0,0,0.5);
  --lumi-fab-shadow-hover: 6px 6px 0 rgba(0,0,0,0.6);
}
```

## 组件命名规范

- **`lm-*`**：主题无关组件（shell、chat、form、buttons、sessions、memory）
- **`lumi-*`**：AI 交互特有内部组件（tool-call、running indicator、streaming dots）
- 新增 CSS 时使用 `lm-` 前缀，用 `--lumi-*` Token 控制视觉
- 不要写死颜色/字体/圆角/阴影值
