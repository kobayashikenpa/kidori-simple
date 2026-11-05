// 前のデータの式を数字に置き換える（第2.2版。仕様書 26.4）。純粋関数（元のデータは書き換えない）。
// - 前の版（第2.1版まで）で保存した仕事・履歴の中の部材・送るファイル・バックアップの、式で入れた W・H を、
//   そのときの仕上がり寸法（前の版の計算 legacyComputeDimensions と同じ値。小数第1位に丸める）の数字にする
// - 調整寸法は、そのデータの中の調整寸法の一覧で計算する（保存データなら AppData.adjusts、ファイルならファイルの adjusts）
// - 式がエラーで値が出ないもの（無い部材・削除した調整寸法・循環・0 以下 など）は空にして、知らせる一覧に入れる
// 数字だけの W・H（キーで入れている途中の「12.」・空も）は式ではないので、そのまま残す（size.ts の isSizeInput）。
// 第2.3版（仕様書 27.4）から、数字と ＋ − × ÷ ( ) だけの式（1800-40 など。途中の形・エラーの式も）もそのまま残す。
// 先頭に「＝」の付いた数字・数字だけの式は「＝」を外して残す（暫定。第2.3版の W・H には「＝」を使えないため）
import { partLabelAt } from '../parts'
import { isSizeInput, normalizeSizeText, sizeText } from '../size'
import { AXES, type Adjust, type Axis, type CellClip, type HistoryEntry, type Job, type Part, type Settings } from '../types'
import { legacyComputeDimensions } from './legacyDimensions'

/** 前の版の調整寸法の表の1行（書きかけ＝名前だけ・寸法だけも。第1.6版までの形もこれで読める） */
export interface LegacyAdjust {
  id: string
  name: string
  value: number | null
}

/** エラーで空にした W・H（1つの軸ごと） */
export interface ClearedSize {
  jobId: string
  /** 仕事の名前 */
  jobName: string
  /** 部材の表示用の名前（名前が空なら #行番号。履歴の中なら履歴の部材の並びで数える） */
  partName: string
  axis: Axis
  /** 履歴の中の部材のとき、その履歴（無ければ今の部材） */
  history?: Pick<HistoryEntry, 'id' | 'savedAt' | 'memo'>
}

/** 置き換えの結果。replaced は式が1つでもあって置き換えたか（無ければ cleared も空） */
export interface NumberingReport {
  replaced: boolean
  /** エラーで空にしたもの（仕事の並び → 今の部材 → 履歴（新しい順）、部材の並び → W・H の順） */
  cleared: ClearedSize[]
}

export const NO_NUMBERING: NumberingReport = { replaced: false, cleared: [] }

/** 式で使える調整寸法（名前があり、寸法が 0 より大きい行。前の版の usableAdjusts と同じ） */
function usableOf(rows: readonly LegacyAdjust[]): Adjust[] {
  return rows.filter((r): r is Adjust => r.name.trim() !== '' && r.value !== null && Number.isFinite(r.value) && r.value > 0)
}

/** W・H の文字が置き換える式か（数字・数字だけの式の形でない。部材の寸法・調整寸法・「＝」などを使っている） */
const isFormula = (text: string): boolean => !isSizeInput(text)

/**
 * 先頭に「＝」（全角・半角）の付いた、数字・数字だけの式なら、「＝」を外してそろえた形（例：「＝1800 − 40」→「1800-40」）。
 * それ以外（「＝」が無い・「＝」だけ・後ろに部材の寸法などがある）は null
 */
function withoutEquals(text: string): string | null {
  const m = /^\s*=(.*)$/su.exec(text.normalize('NFKC'))
  if (!m) return null
  const rest = m[1]
  return rest.trim() !== '' && isSizeInput(rest) ? normalizeSizeText(rest) : null
}

type SizePart = Pick<Part, 'name' | 'expr'>

/**
 * 部材の並び（今の部材でも履歴の部材でも）の式を数字にする。その並びの中の部材どうしで計算する。
 * 式が無ければ同じ配列を返す（changed: false）
 */
function numberizeParts<P extends SizePart>(
  parts: readonly P[],
  settings: Settings,
  adjusts: readonly Adjust[],
): { parts: P[]; cleared: { partName: string; axis: Axis }[]; changed: boolean } {
  if (!parts.some((p) => AXES.some((a) => isFormula(p.expr[a])))) return { parts: parts as P[], cleared: [], changed: false }
  // 履歴の部材は id を持たないので、並びの位置で id を振って前の版の計算に渡す
  const calc = parts.map((p, i): Part => ({ id: `p${i}`, name: p.name, expr: p.expr, quantity: 1, rotatable: false, finishedDone: false }))
  const dims = legacyComputeDimensions({ parts: calc, settings }, adjusts)
  const cleared: { partName: string; axis: Axis }[] = []
  const out = parts.map((p, i) => {
    if (!AXES.some((a) => isFormula(p.expr[a]))) return p
    const expr = { ...p.expr }
    for (const a of AXES) {
      if (!isFormula(p.expr[a])) continue
      const kept = withoutEquals(p.expr[a])
      if (kept !== null) {
        expr[a] = kept
        continue
      }
      const v = dims.parts[i].finishedByAxis[a]
      if (v === undefined) {
        expr[a] = ''
        cleared.push({ partName: partLabelAt(p, i), axis: a })
      } else {
        expr[a] = sizeText(v)
      }
    }
    return { ...p, expr }
  })
  return { parts: out, cleared, changed: true }
}

/**
 * 仕事の W・H の式を、仕上がり寸法の数字に置き換える（今の部材と、履歴の中の部材）。
 * adjusts はそのデータの中の調整寸法の一覧（書きかけの行は使えない）。式が無ければ同じ仕事を返す。
 * 名前・枚数・回転・仕上がりのチェック・id・固定した1枚・設定・日付は変えない
 */
export function numberizeJob(job: Job, adjusts: readonly LegacyAdjust[]): { job: Job; report: NumberingReport } {
  const usable = usableOf(adjusts)
  const now = numberizeParts(job.parts, job.settings, usable)
  const cleared: ClearedSize[] = now.cleared.map((c) => ({ jobId: job.id, jobName: job.name, ...c }))
  let historyChanged = false
  const history = job.history.map((h) => {
    const r = numberizeParts(h.parts, h.settings, usable)
    if (!r.changed) return h
    historyChanged = true
    for (const c of r.cleared) cleared.push({ jobId: job.id, jobName: job.name, ...c, history: { id: h.id, savedAt: h.savedAt, memo: h.memo } })
    return { ...h, parts: r.parts }
  })
  if (!now.changed && !historyChanged) return { job, report: NO_NUMBERING }
  return {
    job: { ...job, parts: now.parts, history: historyChanged ? history : job.history },
    report: { replaced: true, cleared },
  }
}

/** 全部の仕事を置き換える（numberizeJob を仕事の並びで）。エラーで空にしたものは仕事の並びでまとめる */
export function numberizeJobs(jobs: readonly Job[], adjusts: readonly LegacyAdjust[]): { jobs: Job[]; report: NumberingReport } {
  const out: Job[] = []
  const cleared: ClearedSize[] = []
  let replaced = false
  for (const j of jobs) {
    const r = numberizeJob(j, adjusts)
    out.push(r.job)
    replaced ||= r.report.replaced
    cleared.push(...r.report.cleared)
  }
  return { jobs: out, report: replaced ? { replaced, cleared } : NO_NUMBERING }
}

/** 2つの置き換えの結果をまとめる */
export function mergeNumbering(a: NumberingReport, b: NumberingReport): NumberingReport {
  if (!a.replaced) return b
  if (!b.replaced) return a
  return { replaced: true, cleared: [...a.cleared, ...b.cleared] }
}

/**
 * セルの文字が置き換える式か（部材の寸法・調整寸法・「＝」などが入っている）。名前・数字・空・数字だけの式（第2.3版）は式ではない
 */
function looksLikeFormula(text: string): boolean {
  const t = text.normalize('NFKC').trim()
  if (t === '' || isSizeInput(t)) return false
  return /[+\-*/().{}=\s×✕÷−–—]/u.test(t)
}

/**
 * アプリの中でコピーしておいたセル（AppData.cellClip）に、置き換える式が入っているか（仕様書 26.4：入っていればそのコピーは捨てる）。
 * 数字だけの式（1800 - 40 など）は第2.3版でそのまま使えるので捨てない（仕様書 27.4）。
 * コピーには列の位置が無いので、セルの文字で見分ける（前の版の名前には式の記号を使えなかったので、記号の入ったセルは式）
 */
export function clipHasFormula(clip: CellClip): boolean {
  return clip.cells.some((row) => row.some(looksLikeFormula))
}

/** 知らせる一覧の1つ：「本棚・棚板 W」（履歴の中なら「（履歴）」を付ける） */
function clearedLabel(c: ClearedSize): string {
  return `${c.jobName}・${c.partName} ${c.axis}${c.history ? '（履歴）' : ''}`
}

/**
 * 1度だけ出す知らせの文（仕様書 26.4）：「式を数字に置き換えました（エラーで空にしたもの 2件：本棚・棚板 W、…）」。
 * 置き換えていなければ null
 */
export function numberingMessage(report: NumberingReport): string | null {
  if (!report.replaced) return null
  const head = '式を数字に置き換えました'
  if (report.cleared.length === 0) return head
  return `${head}（エラーで空にしたもの ${report.cleared.length}件：${report.cleared.map(clearedLabel).join('、')}）`
}
