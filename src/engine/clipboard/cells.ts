// 部材の表のセルのコピーと貼り付け・消す・行を削除（第1.2版。仕様書 16.1）と、
// 範囲（四角）・切り取り・オートフィル（第1.3版。仕様書 17.3・17.4）。新しく作ったもの（kidori には無い）。
// - セルの位置は { row: 表の行（0 から。job.parts の位置。部材の数以上は空の行）, col: 名前・W・H・枚数 }
// - 選んだセルは、セルの配列か四角い範囲（CellRange）のどちらでも渡せる（CellSelection）
// - コピーは「1つのセル」か「四角い範囲（続いた行 × 続いた列）」だけ。中身は文字のまま（W・H は数字の文字、枚数は数字の文字）
// - 貼り付けは中身の上書き。W・H には数字だけ貼る（第2.2版。仕様書 26.1）。名前は書いたまま貼る（同じ名前でもよい・番号は振らない。仕様書 26.3）
// 仕事は書き換えず、新しい仕事を返す（updatedAt とコピーしたセル AppData.cellClip の保存は store の側で行う）
import { normalizeFormulaText } from '../formula/tokenize'
import { isBlankPart } from '../parts'
import { pastedSize } from '../size'
import { CELL_COLS, type CellClip, type CellCol, type CellPos, type CellRange, type Job, type Part } from '../types'

export const COPY_SHAPE_MESSAGE = 'コピーは1つのセルか、四角い範囲を選んでください'
export const NOT_QUANTITY_MESSAGE = '枚数には 0 以上の整数だけ貼れます'
export const NOT_SIZE_MESSAGE = 'W・H には 0 より大きい数だけ貼れます'
export const FILL_RANGE_MESSAGE = '引く元の範囲を選んでください'

/** 選んだセル：セルの配列か、四角い範囲（第1.3版。画面は四角で持つ） */
export type CellSelection = CellRange | readonly CellPos[]

/** 選んだセルの形。1つのセルは 1行×1列の range。left は列の位置（0＝名前 … 3＝枚数） */
export type SelectionShape =
  | { kind: 'none' }
  | { kind: 'range'; top: number; left: number; rows: number; cols: number }
  | { kind: 'scattered' }

const colIndex = (col: CellCol): number => CELL_COLS.indexOf(col)
const keyOf = (row: number, col: number): string => `${row}:${col}`

const isCellArray = (sel: CellSelection): sel is readonly CellPos[] => Array.isArray(sel)

/** 四角い範囲のセル（上から・左から）。表の左右をはみ出す列と、0 より上の行は入れない */
export function rangeCells(range: CellRange): CellPos[] {
  const out: CellPos[] = []
  const top = Math.max(0, Math.ceil(range.top))
  const bottom = Math.floor(range.top + range.rows - 1)
  const left = Math.max(0, Math.ceil(range.left))
  const right = Math.min(CELL_COLS.length - 1, Math.floor(range.left + range.cols - 1))
  for (let r = top; r <= bottom; r++) for (let j = left; j <= right; j++) out.push({ row: r, col: CELL_COLS[j] })
  return out
}

/** 行全体（名前〜枚数）の範囲 */
export function rowRange(top: number, rows = 1): CellRange {
  return { top, left: 0, rows, cols: CELL_COLS.length }
}

/**
 * 列全体の範囲：上から部材の数の行（空の行は入れない。部材が無ければ1行）。
 * 部材は途中に空の行を作らず上から詰めて並ぶので、「部材のある行まで」と同じ
 */
export function columnRange(job: Pick<Job, 'parts'>, left: number, cols = 1): CellRange {
  return { top: 0, left, rows: Math.max(1, job.parts.length), cols }
}

/** 選んだセルが四角い範囲（1つのセルも）ならその範囲（表の中に収めた形）、それ以外は null */
export function selectionRange(selected: CellSelection): CellRange | null {
  const s = selectionShape(selected)
  return s.kind === 'range' ? { top: s.top, left: s.left, rows: s.rows, cols: s.cols } : null
}

/** 選んだセルをそろえる：行が 0 以上の整数で列が表の列のものだけ、重なりを外し、上から・左から並べる */
function normalizeSelection(selected: CellSelection): CellPos[] {
  if (!isCellArray(selected)) return rangeCells(selected)
  const seen = new Set<string>()
  const out: CellPos[] = []
  for (const s of selected) {
    const ci = colIndex(s.col)
    if (!Number.isInteger(s.row) || s.row < 0 || ci < 0) continue
    const k = keyOf(s.row, ci)
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ row: s.row, col: s.col })
  }
  return out.sort((a, b) => a.row - b.row || colIndex(a.col) - colIndex(b.col))
}

/** 選んだセルが 何も無い／1つか四角い範囲／それ以外（離れたセル・欠けた四角） のどれか */
export function selectionShape(selected: CellSelection): SelectionShape {
  const cells = normalizeSelection(selected)
  if (cells.length === 0) return { kind: 'none' }
  const rows = cells.map((s) => s.row)
  const cols = cells.map((s) => colIndex(s.col))
  const top = Math.min(...rows)
  const left = Math.min(...cols)
  const h = Math.max(...rows) - top + 1
  const w = Math.max(...cols) - left + 1
  // 重なりを外したので、数が 行×列 なら四角が全部埋まっている
  return cells.length === h * w ? { kind: 'range', top, left, rows: h, cols: w } : { kind: 'scattered' }
}

/** セルの中身の文字（名前・式は書いたまま。枚数は数字の文字で、空は ''。空の行は ''） */
export function cellText(job: Pick<Job, 'parts'>, pos: CellPos): string {
  const p = job.parts[pos.row] as Part | undefined
  if (!p) return ''
  switch (pos.col) {
    case 'name':
      return p.name
    case 'W':
    case 'H':
      return p.expr[pos.col]
    case 'qty':
      return p.quantity === null ? '' : String(p.quantity)
  }
}

export type CopyCellsResult = { ok: true; clip: CellClip } | { ok: false; message: string }

/** セルをコピーする。1つのセルか四角い範囲だけ（それ以外は「コピーは1つのセルか、四角い範囲を選んでください」） */
export function copyCells(job: Pick<Job, 'parts'>, selected: CellSelection): CopyCellsResult {
  const shape = selectionShape(selected)
  if (shape.kind !== 'range') return { ok: false, message: COPY_SHAPE_MESSAGE }
  const cells: string[][] = []
  for (let i = 0; i < shape.rows; i++) {
    const line: string[] = []
    for (let j = 0; j < shape.cols; j++) line.push(cellText(job, { row: shape.top + i, col: CELL_COLS[shape.left + j] }))
    cells.push(line)
  }
  return { ok: true, clip: { rows: shape.rows, cols: shape.cols, cells } }
}

/**
 * セルを切り取る（仕様書 17.3）。中身はコピーと同じで、元（仕事の id と範囲）を clip.cut に付ける。
 * 元のセルは貼ったときに空にする（pasteCells・clearCutSource）。貼る前にほかをコピーすると clip ごと置き換わるので、元は消えない
 */
export function cutCells(job: Pick<Job, 'id' | 'parts'>, selected: CellSelection): CopyCellsResult {
  const r = copyCells(job, selected)
  const range = selectionRange(selected)
  if (!r.ok || !range) return r
  return { ok: true, clip: { ...r.clip, cut: { jobId: job.id, range } } }
}

/**
 * 貼れなかった理由。notQuantity：枚数に 0 以上の整数でないもの / notSize：W・H に 0 より大きい数でないもの（式・名前の文字・0）。
 * 第2.2版（仕様書 26.3）で名前は何でも貼れるようにした（invalidName と、番号を振ったセル renamed はなくした）
 */
export type PasteSkipReason = 'notQuantity' | 'notSize'

export interface PasteSkip {
  /** 貼れなかったセル（表の位置） */
  cell: CellPos
  reason: PasteSkipReason
  /** 画面に出せる日本語 */
  message: string
}

export type PasteCellsResult =
  | {
      ok: true
      job: Job
      /** 貼ったセルの数（「◯つのセルに貼りました」） */
      pasted: number
      /** 貼れなかったセル（表の上から・左から） */
      skipped: PasteSkip[]
      /**
       * 切り取りを、元と違う仕事に貼ったとき：元の仕事で空にするセル（clearCutSource に渡す）。それ以外は null。
       * 同じ仕事の切り取りは、返す job の中で元を空にしてある
       */
      cutClear: { jobId: string; cells: CellPos[] } | null
    }
  | { ok: false; message: string }

/** 枚数の欄に貼る文字から枚数。空は null（空にする）、0 以上の整数（全角の数字も）はその数、それ以外は undefined（貼らない） */
function quantityOf(text: string): number | null | undefined {
  const t = normalizeFormulaText(text).trim()
  if (t === '') return null
  return /^[0-9]+$/.test(t) ? Number(t) : undefined
}

/** 表の位置に書く文字。src はクリップの中の位置（行 × 列の数 ＋ 列。切り取りの元と結ぶ） */
interface Target {
  row: number
  col: number
  text: string
  src: number
}

interface Write {
  /** 表の位置（知らせに使う） */
  cell: CellPos
  /** 書く部材の位置（空の行は部材の後ろに詰めた位置） */
  index: number
  text: string
  src: number
}

/** 同じ仕事の切り取りで、先に空にしておく元のセル（貼れなかったら元に戻す） */
interface CutCell {
  row: number
  col: CellCol
  src: number
}

function setCellEmpty(p: Part, col: CellCol): void {
  if (col === 'name') p.name = ''
  else if (col === 'qty') p.quantity = null
  else p.expr[col] = ''
}

function copyCell(to: Part, from: Part, col: CellCol): void {
  if (col === 'name') to.name = from.name
  else if (col === 'qty') to.quantity = from.quantity
  else to.expr[col] = from.expr[col]
}

interface Applied {
  job: Job
  pasted: number
  skipped: PasteSkip[]
  /** 1つでも貼れたクリップの中の位置 */
  filled: Set<number>
}

/**
 * 表の位置に文字を書く（貼り付けとオートフィルで同じ）。
 * - 空の行（部材の数以上）は、上から部材の後ろに詰めて部材を作る（id は newId('part')、枚数は空から、回転しない）
 * - cutFirst：同じ仕事の切り取りの元。書く前に空にし、そのクリップの位置が1つも貼れなかったセルは元に戻す
 * - 貼って行の全部の欄が空になった部材は消す。1つも貼れなかったときは同じ仕事を返す
 */
function applyTargets(job: Job, targets: Target[], newId: (prefix: string) => string, cutFirst: CutCell[]): Applied {
  const count = job.parts.length
  const newRows = [...new Set(targets.filter((t) => t.row >= count).map((t) => t.row))].sort((a, b) => a - b)
  const indexOfRow = new Map(newRows.map((r, k) => [r, count + k]))
  const parts: Part[] = job.parts.map((p) => ({ ...p, expr: { ...p.expr } }))
  for (let k = 0; k < newRows.length; k++) {
    parts.push({ id: newId('part'), name: '', expr: { W: '', H: '' }, quantity: null, rotatable: false, finishedDone: false })
  }
  const writes: Write[] = targets.map((t) => ({
    cell: { row: t.row, col: CELL_COLS[t.col] },
    index: t.row < count ? t.row : indexOfRow.get(t.row)!,
    text: t.text,
    src: t.src,
  }))
  for (const c of cutFirst) setCellEmpty(parts[c.row], c.col)

  const skipped: PasteSkip[] = []
  const touched = new Set<number>()
  const filled = new Set<number>()
  let pasted = 0

  // W・H・枚数
  for (const w of writes) {
    const p = parts[w.index]
    if (w.cell.col === 'W' || w.cell.col === 'H') {
      const size = pastedSize(w.text)
      if (size === undefined) {
        skipped.push({ cell: w.cell, reason: 'notSize', message: NOT_SIZE_MESSAGE })
        continue
      }
      p.expr[w.cell.col] = size
    } else if (w.cell.col === 'qty') {
      const q = quantityOf(w.text)
      if (q === undefined) {
        skipped.push({ cell: w.cell, reason: 'notQuantity', message: NOT_QUANTITY_MESSAGE })
        continue
      }
      p.quantity = q
    } else {
      // 名前：前後の空白を外して書いたまま入れる（同じ名前でもよい。第2.2版。仕様書 26.3）
      p.name = w.text.trim()
    }
    touched.add(w.index)
    filled.add(w.src)
    pasted++
  }

  skipped.sort((a, b) => a.cell.row - b.cell.row || colIndex(a.cell.col) - colIndex(b.cell.col))
  if (pasted === 0) return { job, pasted, skipped, filled }
  // 切り取りの元：貼れた位置は空のまま、貼れなかった位置は元に戻す
  for (const c of cutFirst) {
    if (filled.has(c.src)) touched.add(c.row)
    else copyCell(parts[c.row], job.parts[c.row], c.col)
  }
  const kept = parts.filter((p, i) => !(touched.has(i) || i >= count) || !isBlankPart(p))
  return { job: { ...job, parts: kept }, pasted, skipped, filled }
}

/** 切り取りの元の範囲で、クリップの中の位置 src にあたるセル（表をはみ出せば null） */
function cutSourceCell(clip: CellClip, src: number): CellPos | null {
  if (!clip.cut) return null
  const i = Math.floor(src / clip.cols)
  const j = src % clip.cols
  const row = clip.cut.range.top + i
  const ci = clip.cut.range.left + j
  if (row < 0 || ci < 0 || ci >= CELL_COLS.length) return null
  return { row, col: CELL_COLS[ci] }
}

/** 元のセルが、切り取ったときのまま（クリップの中身と同じ）か */
function sameAsClip(job: Pick<Job, 'parts'>, clip: CellClip, cell: CellPos): boolean {
  if (!clip.cut) return false
  const i = cell.row - clip.cut.range.top
  const j = colIndex(cell.col) - clip.cut.range.left
  if (i < 0 || i >= clip.rows || j < 0 || j >= clip.cols) return false
  return cellText(job, cell) === clip.cells[i][j]
}

/**
 * コピーしたセルを貼る。
 * - 1つのセルのコピー：選んだセル全部に同じものを貼る
 * - 範囲のコピー：選んだセルの一番左上（いちばん上の行・いちばん左の列）から同じ形で貼る。表の右（枚数）をはみ出す列は貼らない
 * - 空の行に貼ると部材を作る（id は newId('part')、枚数は空から、回転しない）。途中の空の行も、部材の後ろに上から詰めて足す（暫定）
 * - 名前：前後の空白を外して書いたまま入れる。同じ名前になってもよく、番号は振らない（第2.2版。仕様書 26.3）
 * - 枚数：0 以上の整数だけ（空は空にする）。W・H：0 より大きい数だけ（全角・余分な 0 はそろえる。空は空にする。式・名前の文字・0 は notSize。第2.2版）
 * - 貼って行の全部の欄が空になった部材は消す。1つも貼れなかったときは同じ仕事を返す
 * - 切り取り（clip.cut）：元のセルを空にする（第1.3版）。貼る先と重なるセル・1つも貼れなかったクリップの位置・
 *   切り取ったあとに書き換えたセルは空にしない。同じ仕事なら返す job の中で空にし、
 *   違う仕事なら cutClear で返す。クリップをふつうのコピーに変えるのは store の側
 */
export function pasteCells(job: Job, clip: CellClip, selected: CellSelection, newId: (prefix: string) => string): PasteCellsResult {
  const cells = normalizeSelection(selected)
  if (cells.length === 0) return { ok: false, message: '貼るセルを選んでください' }

  // 表の位置ごとに貼る文字
  const targets: Target[] = []
  if (clip.rows === 1 && clip.cols === 1) {
    for (const s of cells) targets.push({ row: s.row, col: colIndex(s.col), text: clip.cells[0][0], src: 0 })
  } else {
    const top = Math.min(...cells.map((s) => s.row))
    const left = Math.min(...cells.map((s) => colIndex(s.col)))
    for (let i = 0; i < clip.rows; i++) {
      for (let j = 0; j < clip.cols; j++) {
        if (left + j >= CELL_COLS.length) continue
        targets.push({ row: top + i, col: left + j, text: clip.cells[i][j], src: i * clip.cols + j })
      }
    }
  }

  const cut = clip.cut
  const sameJob = cut !== undefined && cut.jobId === job.id
  const cutFirst: CutCell[] = []
  if (sameJob) {
    const targetKeys = new Set(targets.map((t) => keyOf(t.row, t.col)))
    for (let src = 0; src < clip.rows * clip.cols; src++) {
      const cell = cutSourceCell(clip, src)
      if (!cell || cell.row >= job.parts.length) continue
      if (targetKeys.has(keyOf(cell.row, colIndex(cell.col)))) continue
      if (!sameAsClip(job, clip, cell)) continue
      cutFirst.push({ row: cell.row, col: cell.col, src })
    }
  }

  const r = applyTargets(job, targets, newId, cutFirst)
  let cutClear: { jobId: string; cells: CellPos[] } | null = null
  if (cut && !sameJob && r.pasted > 0) {
    const srcCells = [...r.filled]
      .sort((a, b) => a - b)
      .map((src) => cutSourceCell(clip, src))
      .filter((c): c is CellPos => c !== null)
    cutClear = { jobId: cut.jobId, cells: srcCells }
  }
  return { ok: true, job: r.job, pasted: r.pasted, skipped: r.skipped, cutClear }
}

/**
 * 切り取りを違う仕事に貼ったあと、元の仕事のセルを空にする（pasteCells の cutClear.cells を渡す。job は cutClear.jobId の仕事）。
 * 切り取ったあとに書き換えたセル（中身がクリップと違う）は空にしない。行の全部の欄が空になった部材は消す
 */
export function clearCutSource(job: Job, clip: CellClip, cells: readonly CellPos[]): Job {
  return clearCells(
    job,
    cells.filter((c) => sameAsClip(job, clip, c)),
  )
}

/**
 * オートフィル（仕様書 17.4）：元の範囲 from の値を、引いた先の範囲 to の行へ上下にくり返して入れる（数は増やさない）。
 * - to は元を含めた引いたあとの範囲でも、元を除いた所だけでもよい。元の行は書かない。列はいつも元の列（上下だけ）
 * - 上へ引いたときも、元の並びがつながるようにくり返す（元の下の端の行が、元のすぐ上に入る）
 * - 名前の列も同じ名前をくり返して入れる（第2.2版で番号を振るのはやめた。仕様書 26.3）
 * - 枚数・W・H・行が足りないときの部材の足し方・全部空になった部材は、貼り付け（pasteCells）と同じ
 */
export function fillCells(job: Job, from: CellRange, to: CellRange, newId: (prefix: string) => string): PasteCellsResult {
  const src = selectionRange(from)
  if (!src) return { ok: false, message: FILL_RANGE_MESSAGE }
  const top = Math.max(0, Math.ceil(to.top))
  const bottom = Math.floor(to.top + to.rows - 1)
  const targets: Target[] = []
  for (let r = top; r <= bottom; r++) {
    if (r >= src.top && r < src.top + src.rows) continue
    const k = (((r - src.top) % src.rows) + src.rows) % src.rows
    for (let j = 0; j < src.cols; j++) {
      const col = src.left + j
      const text = cellText(job, { row: src.top + k, col: CELL_COLS[col] })
      targets.push({ row: r, col, text, src: k * src.cols + j })
    }
  }
  const a = applyTargets(job, targets, newId, [])
  return { ok: true, job: a.job, pasted: a.pasted, skipped: a.skipped, cutClear: null }
}

/** 選んだセルのある行の部材の id（部材の並び。空の行は入れない） */
export function selectedPartIds(job: Pick<Job, 'parts'>, selected: CellSelection): string[] {
  const rows = new Set(normalizeSelection(selected).map((s) => s.row))
  return job.parts.filter((_, i) => rows.has(i)).map((p) => p.id)
}

/**
 * 選んだセルの中身を消す（名前・W・H は空、枚数は空）。名前を消してもほかの式は書き換えない。
 * 行の全部の欄が空になった部材は消す。空の行のセルは何もしない（部材の行が1つも無ければ同じ仕事を返す）
 */
export function clearCells(job: Job, selected: CellSelection): Job {
  const cells = normalizeSelection(selected).filter((s) => s.row < job.parts.length)
  if (cells.length === 0) return job
  const parts: Part[] = job.parts.map((p) => ({ ...p, expr: { ...p.expr } }))
  const touched = new Set<number>()
  for (const s of cells) {
    setCellEmpty(parts[s.row], s.col)
    touched.add(s.row)
  }
  return { ...job, parts: parts.filter((p, i) => !touched.has(i) || !isBlankPart(p)) }
}

/**
 * 選んだセルのある行の部材をまとめて消す（空の行だけなら同じ仕事を返す）。
 * 第2.2版で式はなくなったので、ほかの部材の式で使われているかの確認はしない（画面はいつも削除の確認だけ出す）
 */
export function deleteRows(job: Job, selected: CellSelection): Job {
  const ids = new Set(selectedPartIds(job, selected))
  if (ids.size === 0) return job
  return { ...job, parts: job.parts.filter((p) => !ids.has(p.id)) }
}
