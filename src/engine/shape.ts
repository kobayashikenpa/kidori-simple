// 保存データ・共有とバックアップのファイルの中身の形の確かめ（store/storage.ts から移した。第1.1版 E-11）。
// 手で書き換えたデータや途中までのデータで画面が真っ白にならないよう、形が違えば「読めない」とする
import type { LegacyAdjust } from './migrate/numbers'
import { CELL_COLS, type Adjust, type CellClip, type CellCut, type CellRange, type FrozenSheet, type HistoryEntry, type HistoryPart, type Job, type Part, type Settings, type Sheet } from './types'

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const isString = (v: unknown): v is string => typeof v === 'string'
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isNonNegative = (v: unknown): v is number => isFiniteNumber(v) && v >= 0
const isPositive = (v: unknown): v is number => isFiniteNumber(v) && v > 0

function isSheet(v: unknown): v is Sheet {
  return (
    isRecord(v) &&
    (v.sizeKind === 'saburoku' || v.sizeKind === 'shihachi' || v.sizeKind === 'custom') &&
    isPositive(v.width) &&
    isPositive(v.length)
  )
}

function isSettings(v: unknown): v is Settings {
  return (
    isRecord(v) &&
    isSheet(v.sheet) &&
    isNonNegative(v.kerf) &&
    isNonNegative(v.trim) &&
    isNonNegative(v.allowance) &&
    (v.cutMode === 'vertical' || v.cutMode === 'horizontal')
  )
}

function isExpr(v: unknown): v is Part['expr'] {
  return isRecord(v) && isString(v.W) && isString(v.H)
}

export function isPart(v: unknown): v is Part {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.name) &&
    isExpr(v.expr) &&
    // 枚数は 0 以上の整数か、空（null。第1.1版）
    (v.quantity === null || (Number.isInteger(v.quantity) && (v.quantity as number) >= 0)) &&
    typeof v.rotatable === 'boolean' &&
    typeof v.finishedDone === 'boolean'
  )
}

/** 部材の表の四角い範囲（第1.3版）：整数で、行は 0 から・列は表の中、1行×1列以上 */
export function isCellRange(v: unknown): v is CellRange {
  if (!isRecord(v) || ![v.top, v.left, v.rows, v.cols].every((n) => Number.isInteger(n))) return false
  const { top, left, rows, cols } = v as unknown as CellRange
  return top >= 0 && left >= 0 && rows >= 1 && cols >= 1 && left + cols <= CELL_COLS.length
}

/** 切り取りの元（第1.3版）：仕事の id と、クリップと同じ形の範囲 */
function isCellCut(v: unknown, rows: number, cols: number): v is CellCut {
  return isRecord(v) && isString(v.jobId) && isCellRange(v.range) && v.range.rows === rows && v.range.cols === cols
}

/**
 * コピーしたセル（第1.2版）：1〜部材の表の列の数の四角い形で、中身は全部文字。
 * 切り取りの元 cut（第1.3版）は無くてもよい（第1.2版の保存データ）。あるときは形も確かめる
 */
export function isCellClip(v: unknown): v is CellClip {
  if (!isRecord(v) || !Number.isInteger(v.rows) || !Number.isInteger(v.cols)) return false
  const rows = v.rows as number
  const cols = v.cols as number
  if (rows < 1 || cols < 1 || cols > CELL_COLS.length) return false
  if (v.cut !== undefined && !isCellCut(v.cut, rows, cols)) return false
  return (
    Array.isArray(v.cells) &&
    v.cells.length === rows &&
    v.cells.every((r) => Array.isArray(r) && r.length === cols && r.every(isString))
  )
}

/**
 * 保存データのコピーしたセルを読む。形が違えば null。切り取りの元だけ形が違うときは、元を外してふつうのコピーとして読む（暫定）
 */
export function readCellClip(v: unknown): CellClip | null {
  if (isCellClip(v)) return v
  if (!isRecord(v) || v.cut === undefined) return null
  const { cut: _cut, ...rest } = v
  return isCellClip(rest) ? rest : null
}

/** 固定した1枚は計算の写しなので、画面が使う所（id・板・1枚の片・チェック）だけ確かめる */
function isFrozenSheet(v: unknown): v is FrozenSheet {
  if (!isRecord(v) || !isString(v.id) || !isSheet(v.sheet) || !isString(v.frozenAt)) return false
  if (v.mode !== 'vertical' && v.mode !== 'horizontal') return false
  if (!isNonNegative(v.kerf) || !isNonNegative(v.trim)) return false
  if (!Array.isArray(v.checked) || !v.checked.every(isString)) return false
  if (v.completedAt !== undefined && !isString(v.completedAt)) return false
  const l = v.layout
  return isRecord(l) && Array.isArray(l.placements) && Array.isArray(l.trims) && Array.isArray(l.cuts) && Array.isArray(l.scraps) && isRecord(l.usable)
}

/** 履歴の部材（第2.1版）：部材から id を除いた形 */
function isHistoryPart(v: unknown): v is HistoryPart {
  return isRecord(v) && isPart({ ...v, id: '' })
}

/** 履歴の1件（第2.1版。仕様書 25.1） */
export function isHistoryEntry(v: unknown): v is HistoryEntry {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.savedAt) &&
    isString(v.memo) &&
    isSettings(v.settings) &&
    Array.isArray(v.parts) &&
    v.parts.every(isHistoryPart) &&
    Number.isInteger(v.sheetCount) &&
    (v.sheetCount as number) >= 0 &&
    isNonNegative(v.yieldRate)
  )
}

/** 履歴の並び：どれも履歴の形で、同じ id が無い */
function isHistory(v: unknown): v is HistoryEntry[] {
  return Array.isArray(v) && v.every(isHistoryEntry) && new Set(v.map((h) => h.id)).size === v.length
}

export function isJob(v: unknown): v is Job {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.name) &&
    isSettings(v.settings) &&
    Array.isArray(v.parts) &&
    v.parts.every(isPart) &&
    Array.isArray(v.frozenSheets) &&
    v.frozenSheets.every(isFrozenSheet) &&
    isHistory(v.history) &&
    isString(v.createdAt) &&
    isString(v.updatedAt)
  )
}

/**
 * 保存データ・取り込むファイルの仕事を読む（第1.4版）。形が違えば null。
 * - 第1.3版までの切り方「おまかせ」（'auto'）は縦切り優先（'vertical'）にして読む（仕様書 18.2）
 * - 第2.0版までの仕事（履歴 history が無い）は、空の履歴にして読む（第2.1版。仕様書 25.1）。履歴があって形が違えば読めない
 */
export function readJob(v: unknown): Job | null {
  if (!isRecord(v)) return null
  let job: Record<string, unknown> = v
  if (isRecord(v.settings) && v.settings.cutMode === 'auto') job = { ...job, settings: { ...v.settings, cutMode: 'vertical' } }
  if (job.history === undefined) job = { ...job, history: [] }
  return isJob(job) ? job : null
}

/** 仕事の並びを読む（readJob）。1つでも読めなければ null */
export function readJobs(v: unknown): Job[] | null {
  if (!Array.isArray(v)) return null
  const out: Job[] = []
  for (const x of v) {
    const j = readJob(x)
    if (!j) return null
    out.push(j)
  }
  return out
}

/** 前の版の調整寸法（送るファイル・バックアップの adjusts の1つ。名前と 0 より大きい寸法） */
export function isAdjust(v: unknown): v is Adjust {
  return isRecord(v) && isString(v.id) && isString(v.name) && isPositive(v.value)
}

/**
 * 前の版の調整寸法の表の行（第1.7版）：名前は文字（空も可）、寸法は 0 より大きい数か空（null）。
 * 第1.6版までの調整寸法（Adjust）もそのまま読める
 */
function isLegacyAdjustRow(v: unknown): v is LegacyAdjust {
  return isRecord(v) && isString(v.id) && isString(v.name) && (v.value === null || isPositive(v.value))
}

/**
 * 前の保存データの調整寸法の表（AppData.adjusts。第2.1版まで）を、式を数字に置き換えるために読む（第2.2版。仕様書 26.4）。
 * 無ければ（第2.2版の保存データ）空。あって形が違う行が1つでもあれば・同じ id の行が2つあれば null（前の版と同じく、読めないとする）
 */
export function readLegacyAdjusts(v: unknown): LegacyAdjust[] | null {
  if (v === undefined) return []
  if (!Array.isArray(v) || !v.every(isLegacyAdjustRow)) return null
  if (new Set(v.map((r) => r.id)).size !== v.length) return null
  return v
}
