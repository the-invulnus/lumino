const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
  "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
  "没有", "看", "好", "自己", "这", "他", "她", "它", "们", "那", "些",
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "under", "again",
  "further", "then", "once", "here", "there", "when", "where", "why",
  "how", "all", "both", "each", "few", "more", "most", "other", "some",
  "such", "no", "nor", "not", "only", "own", "same", "so", "than",
  "too", "very", "just", "about", "and", "but", "or", "if", "because",
  "until", "while", "this", "that", "these", "those", "it", "its"
])

export function tokenize(text: string): string[] {
  if (!text) return []

  const segmenter = new Intl.Segmenter("zh-Hans-CN", { granularity: "word" })
  const segments = segmenter.segment(text)

  const tokens: string[] = []

  for (const segment of segments) {
    if (!segment.isWordLike) continue

    const word = segment.segment.trim().toLowerCase()
    if (word.length < 2) continue
    if (word.length > 20) continue
    if (/^[\d\s./:\\-_+#@!$%^&*()=[\]{}|;:'",<>?`~]+$/.test(word)) continue
    if (STOP_WORDS.has(word)) continue

    tokens.push(word)
  }

  // Also split on common punctuation for CJK mixed with English
  const extraTokens: string[] = []
  for (const token of tokens) {
    if (/[a-z]/.test(token) && /[\u4e00-\u9fff]/.test(token)) {
      const parts = token.split(/(?<=[a-z])(?=[\u4e00-\u9fff])|(?<=[\u4e00-\u9fff])(?=[a-z])/i)
      extraTokens.push(...parts.filter((p) => p.length >= 2 && !STOP_WORDS.has(p.toLowerCase())))
    }
  }

  return [...new Set([...tokens, ...extraTokens])]
}
