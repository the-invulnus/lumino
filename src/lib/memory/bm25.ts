const K1 = 1.2
const B = 0.75

type DocTokens = {
  id: string
  tokens: string[]
}

type TermFreqMap = Map<string, number>

export function buildTermIndex(docs: DocTokens[]): {
  docFreqs: Map<string, number>
  docLengths: Map<string, number>
  avgDocLen: number
  totalDocs: number
} {
  const docFreqs = new Map<string, number>()
  const docLengths = new Map<string, number>()
  let totalLen = 0

  for (const doc of docs) {
    const seen = new Set<string>()
    const len = doc.tokens.length
    docLengths.set(doc.id, len)
    totalLen += len

    for (const token of doc.tokens) {
      if (!seen.has(token)) {
        docFreqs.set(token, (docFreqs.get(token) ?? 0) + 1)
        seen.add(token)
      }
    }
  }

  return {
    docFreqs,
    docLengths,
    avgDocLen: docs.length > 0 ? totalLen / docs.length : 0,
    totalDocs: docs.length
  }
}

function termFreq(tokens: string[], term: string): number {
  let count = 0
  for (const t of tokens) {
    if (t === term) count++
  }
  return count
}

export function scoreDocument(
  docId: string,
  docTokens: string[],
  queryTokens: string[],
  index: ReturnType<typeof buildTermIndex>
): number {
  const dl = index.docLengths.get(docId) ?? 1
  const { avgDocLen, docFreqs, totalDocs } = index

  let score = 0

  for (const qt of queryTokens) {
    const tf = termFreq(docTokens, qt)
    if (tf === 0) continue

    const df = docFreqs.get(qt) ?? 0
    const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1)

    const numerator = tf * (K1 + 1)
    const denominator = tf + K1 * (1 - B + B * (dl / avgDocLen))
    score += idf * (numerator / denominator)
  }

  return score
}
