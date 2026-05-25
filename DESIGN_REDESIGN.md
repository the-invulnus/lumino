# Lumino 设计重构方向

> 基于对侧边栏前端 UI 的全面分析，结合 awesome-design-md 中 Claude、Cursor、Linear、Raycast、Superhuman、Notion、Stripe、Apple 等前沿 DESIGN.md 的设计哲学，提出以下六个重构方向。

---

## 问题诊断

当前 Lumino 侧边栏 UI 的症结：

1. **动画只有模糊光斑 + 点状闪烁**，整个界面几乎是静止的——消息出现无过渡，组件切换无缓动，交互反馈生硬
2. **视觉层次由 Token 撑起来，但节奏是平的**——从 header 到 composer 到历史会话面板，没有呼吸间隙，所有区域权重一致
3. **类名体系成熟但缺少"情绪层"**——`lm-shell` / `lm-bezel` / `lm-chat-bubble` 等定位了基础 UI，但缺少传递品牌温度、营造氛围的中间层
4. **三个主题（Paper/ORYZO/Fictional）在 Token 值上做了差异化**，但 Token 层本身没有定义"情绪"，三个主题给人的感觉是"换皮"而不是"换魂"
5. **CSS 三层架构（tokens / layout / components）很干净**，但缺少第四个维度：**motion/emotion 层**

---

## 方向一：引入 Motion System（运动系统）

### 核心思路

Linear、Raycast、Cursor 给我们的启示：**真正的灵动感来自运动的设计，而不是装饰的数量**。

### 建议

| 维度 | 现状 | 建议 |
|------|------|------|
| **消息出现** | instant render | 从 content script 打字、opacity 0→1 + translateY(6px→0) 的 cascade stagger 进入动画 |
| **气泡切换** | 无过渡 | 用户消息 sent 时有 160ms spring ease-out 的 scale(0.97→1) + opacity(0→1) 微动效 |
| **AI 回复流式输出** | 文字直接追加 | 配合流式输出，每一段文本追加时有 opacity 0→1 淡入 + 光标 pulse 动画 |
| **Tool call 展开/收起** | 瞬间切换 | `max-height` transition + chevron rotate 200ms spring |
| **Composer 发送按钮** | 无过渡 | 发送时 button 有 120ms scale(1→0.92→1) 的微触觉反馈 |
| **会话 Chip 切换** | 瞬间变化 | active chip 下划线有 300ms width transition，从一个 chip 滑到另一个 chip |
| **面板弹出** | 无动画 | Side Nav 展开有 250ms translateX + opacity 的弹性滑入 |

### 参考设计源

- **Raycast**: 纯暗色面板，Inter + ss03 字体，所有交互都给反馈（键盘 shortcut 动画、搜索结果高亮过渡）
- **Cursor**: 消息列表有严格的 stagger 进场时序
- **Apple**: 所有滚动、展开使用 spring physics 而非线性 ease

### 实施要点

在 `tokens.css` 中新增 motion tokens：
```css
--lumi-motion-duration-instant: 80ms;
--lumi-motion-duration-micro: 150ms;
--lumi-motion-duration-short: 250ms;
--lumi-motion-duration-medium: 400ms;
--lumi-motion-ease-entry: cubic-bezier(0, 0, 0.2, 1);      /* ease-out */
--lumi-motion-ease-exit: cubic-bezier(0.4, 0, 1, 1);        /* ease-in */
--lumi-motion-ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); /* spring */
```

---

## 方向二：营造「Spatial Rhythm」（空间节奏）

### 核心思路

当前 Lumino 的 layout 把所有区域压在一起——header → session strip → chat → composer 之间用固定间距，没有任何视觉隔断或区域感。Notion、Claude 的做法是：**每一块区域都有明确的空间归属**。

### 建议

| 区域 | 现状 | 建议 |
|------|------|------|
| **Header** | 紧贴顶部 | 与 chat 区之间有 subtle 的渐变分隔（顶部往下 8px gradient fade），或 1px hairline 与下方形成视觉区隔 |
| **Session Strip** | 芯片横向排列 | 成为独立"托盘"，有 `lm-session-tray` 包裹层，背景微提亮/变暗与主面板形成 layer 感 |
| **Chat 区** | 纯白/纯暗的背景 | 在 chat 区域背后加一层极浅的 noise texture（透明度 2-3%）或 paper grain，模拟"纸面" |
| **Composer** | 跟 chat 同背景 | composer 独立浮起——下方有 `backdrop-filter: blur(12px)` 的磨砂面板，让感觉是"漂浮在底部" |
| **Empty State** | 居中文字提示 | 增加有呼吸感的 welcome 界面：animated logo + 一行有节奏的打字标题 + 渐变分隔线 + 3 个建议快捷入口 |

### 参考设计源

- **Claude**: 纵向滚动时 navigation 与内容之间有完美的间隔节奏
- **Notion**: sidebar → content → properties panel 三层空间区分得非常清楚
- **Stripe**: 页面分为上中下三个叙事段落，各段落之间用 96px spacing 呼吸

---

## 方向三：建立「Emotion Surface Layer」（情绪表现层）

### 核心思路

把 Token 从"颜色变量集合"升级为"情绪变量集合"——定义 Lumino 的 mood，而不是 Lumino 的调色板。

### 建议

定义 3 个情绪 Token（跨主题不变，每个主题填充不同值）：

```css
/* 情绪的"呼吸感"来自这些 Token 的差异化 */
--lumi-mood-warmth: ...;   /* 暖度：暖色调的微妙底色 */
--lumi-mood-depth: ...;    /* 深度：表面的"材质感"（磨砂/镜面/纸纹） */
--lumi-mood-motion: ...;   /* 动感：光斑的移动幅度和速度 */
```

三个主题的情绪定位：

| 主题 | 情绪 | 应该的感受 |
|------|------|----------|
| **Paper** | 安静的私人书房 | 纸面质地、午后光斑、翻页声般的缓动 |
| **ORYZO** | 深夜的暗房 | 屏幕微光、键盘敲击的节奏、潜行的阴影 |
| **Fictional** | 童年的贴纸本 | 彩色便利贴、涂鸦、跳动的硬边投影 |

每个主题的 Token 不仅是"换颜色"，而是"换材质"：
- Paper: `backdrop-filter: blur(16px) saturate(1.2)` + 纹理背景
- ORYZO: `backdrop-filter: blur(24px) saturate(0.8)` + vignette 暗角
- Fictional: no blur, 硬边框 + `box-shadow: 3px 3px 0 var(--color)` + slight rotation on cards

---

## 方向四：引入「Living Background」（活体背景）

### 核心思路

当前 3 个 blob 的漂移动画方向对、但能量太弱（opacity 0.16/0.12/0.08），导致大部分用户根本看不见。需要一个"活"的背景系统，但保持克制（不抢内容）。

### 建议

**升级当前 blob 系统为 Multi-Layer Ambient Background：**

| 层 | 内容 | 表现 |
|----|------|------|
| **Layer 0（底层）** | 极淡的 noise/grain texture | 静态，opacity 2-3%，仅在 Paper 主题激活 |
| **Layer 1（中层）** | 当前 blob 升级：不止 3 个固定位置，而是 5-6 个小尺寸 blob 在整个面板随机分布 | 每 20-30s 循环一次，每个 blob 有不同的漂移方向和速度，使用 `backdrop-filter: blur(80px)` |
| **Layer 2（交互层）** | 微小粒子跟随鼠标/触摸 | 聊天区域有极细微的 dust particle（max 8 个），在背景中极慢移动，opacity 0.04 |

### 参考设计源

- **Stripe**: gradient mesh backdrop 置于页面顶部 1/3，持续的柔和色彩过渡
- **Apple**: 暗色 product tile 与亮色 tile 交替，形成视觉节奏
- **Claude**: cream canvas 上的 warm light spot，而非硬 light

### 实施要点

在 layout.css 中增加 `lm-ambient-dust` 容器，使用 CSS `@property` 定义动画变量（渐变位置、blur 半径等），让背景真正"活"起来。

---

## 方向五：打造「Micro-Interaction Language」（微交互语言）

### 核心思路

用户说"毫无灵性"的核心原因之一是：每个交互都是跳变。Linear、Raycast 之所以感觉"smart"，因为每个按钮、每个 hover 都有精心校准的反馈。

### 建议

需要一套统一的微交互协议：

| 交互类型 | 当前 | 建议 |
|----------|------|------|
| **Hover** | 颜色变化，瞬间 | color/bg 变化 + 140ms ease-out transition |
| **Press/Active** | 无 | scale(0.97) + 60ms micro-bounce |
| **Focus** | 基本无 | 2px outline ring + subtle box-shadow glow，200ms |
| **Toggle 开关** | 瞬间 | 拇指滑动 250ms cubic-bezier(0.2, 0.9, 0.3, 1.2) |
| **删除** | 直接消失 | opacity + height + margin collapse 200ms ease-in 过渡 |
| **滚动到新消息** | 瞬间 | `scroll-behavior: smooth` + 底部 composer 微妙抬升 |
| **Error 出现** | 直接显示 | error badge 有 300ms shake animation 后 settle |

### 参考设计源

- **Apple**: 所有 toggle 用 spring animation，按钮有 press-state scale
- **Linear**: 每一个交互都有 150ms 的 transition，绝不跳变
- **Superhuman**: 键盘指令有视觉脉冲反馈（brief color flash）

### 实施要点

给所有 `lm-*` 和 `lumi-*` 组件的交互状态增加 `transition` 属性：

```css
/* 在 components.css 顶部增加全局交互过渡 */
.lm-chat-bubble,
.lm-session-chip,
.lm-side-nav-btn,
.lm-composer-send,
.lumi-tool-call__trigger {
  transition:
    background-color var(--lumi-motion-duration-micro) var(--lumi-motion-ease-entry),
    transform var(--lumi-motion-duration-instant) var(--lumi-motion-ease-entry),
    opacity var(--lumi-motion-duration-micro) var(--lumi-motion-ease-entry),
    box-shadow var(--lumi-motion-duration-micro) var(--lumi-motion-ease-entry);
}
```

---

## 方向六：重组「Design Narrative」（设计叙事）

### 核心思路

这个问题最深：当前 UI 是"一个面板 + 一些组件"，没有叙事。好的设计像一个故事——Claude 从 cream canvas 开始，Notion 用深蓝 hero → 白色内容 → 彩色 feature card 形成叙事弧线。

Lumino 作为一个"陪伴型 AI 助手"，它应该在 UI 上讲述"陪伴"的故事：
- **进入** → Welcome 动画（logo 呼吸 + 简约问候打字效果）
- **对话中** → 气泡进入的 cascade 节律（user bubble 先进入，AI 逐字浮现）
- **Tool call** → 一个小型"执行进度条/时间线"（Cursor 的 Thinking → Reading → Editing → Done timeline pill）
- **等待时** → running indicator 不仅是三个点，而是一条柔和呼吸的渐变 pulse 线
- **结束** → 最后一条消息结束后，光标消失有 400ms fade，然后回归静止

### 参考设计源

- **Cursor**: AI timeline（Thinking/Reading/Editing/Grep/Done）是一个完整的小故事
- **Claude**: 从 cream 到 navy 的 alternating band 节奏定义了整个页面的叙事节奏
- **Raycast**: 每一个 command 的执行都有视觉化的进度

---

## 优先级排序

| 优先级 | 方向 | 投入 | 收益 | 原因 |
|--------|------|------|------|------|
| **P0** | Motion System | 中 | 极高 | 立竿见影，用户第一感知就是"动起来了" |
| **P0** | Micro-Interaction Language | 中 | 极高 | 消除"跳变感"，交互变得有反馈 |
| **P1** | Spatial Rhythm | 中 | 高 | 解决"割裂感"，区域有归属 |
| **P1** | Living Background | 低 | 高 | 不改组件只升级 blob，效果明显 |
| **P2** | Emotion Surface Layer | 高 | 最高 | 根本性改变，但需要重构 Token 体系 |
| **P2** | Design Narrative | 高 | 最高 | 定义品牌灵魂，但需要产品决策配合 |

---

## 一句话总结

**从"能用的面板"到"有呼吸的陪伴空间"，核心是：动起来（motion）→ 有层次（spatial）→ 有温度（emotion）→ 有灵魂（narrative）。**

先做 P0（Motion + Micro-interaction），这两项改动最少、效果最爆炸——用户立刻能感觉到"这个助手活过来了"。
