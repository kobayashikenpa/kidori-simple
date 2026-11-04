// 部材の W・H の寸法の文字（第2.2版。仕様書 26.1：W・H は数字だけ。式・調整寸法はなくした）。
// 保存の形は今までと同じ文字（Part.expr）のまま、中身を「空か、半角の数字（小数可）」にする（tasks.md 第2.2版の未決事項）
import { round1 } from './round'

/** 保存する W・H の文字の形：半角の数字（小数可）。空も可 */
const SIZE_RE = /^\d+(?:\.\d+)?$/
/** キーで入れている途中も含めた形（数字と小数点1つまで。「12.」「.5」も） */
const INPUT_RE = /^\d*\.?\d*$/

/** 数字の欄の文字をそろえる（全角の数字・小数点を半角に、前後の空白を外す） */
function normalizeNumberText(text: string): string {
  return text.normalize('NFKC').trim()
}

export type SizeRead =
  | { ok: true; value: number }
  /** incomplete：入れている途中の形（空・「12.」）。画面は入力中に出さない */
  | { ok: false; kind: 'syntax' | 'nonPositive'; message: string; incomplete?: true }

export const EMPTY_SIZE_MESSAGE = '数字を入れてください'
export const NON_POSITIVE_SIZE_MESSAGE = '0 より大きい数を入れてください'

/**
 * 保存した W・H の文字を寸法として読む。
 * - 空：「数字を入れてください」（途中の印）
 * - 「12.」「.」：小数点の後ろがまだ（途中の印）
 * - 数字：その数。0 と、小数第1位に丸めて 0 になる数は 0 以下（今までの「0 以下はエラー」と同じ。仕様書 26.1）
 * - それ以外（前の版の式が残っていたときなど）：使えない
 * 全角の数字・前後の空白はそろえて読む
 */
export function readSize(text: string): SizeRead {
  const t = normalizeNumberText(text)
  if (t === '') return { ok: false, kind: 'syntax', message: EMPTY_SIZE_MESSAGE, incomplete: true }
  if (SIZE_RE.test(t)) {
    const value = Number(t)
    if (round1(value) <= 0) return { ok: false, kind: 'nonPositive', message: NON_POSITIVE_SIZE_MESSAGE }
    return { ok: true, value }
  }
  if (/^\d*\.$/.test(t)) return { ok: false, kind: 'syntax', message: `「${t}」の小数点の後ろに数字を入れてください`, incomplete: true }
  return { ok: false, kind: 'syntax', message: `「${text.trim()}」は使えません（W・H は数字だけです）` }
}

/** 保存の形（空か、半角の数字）か。全角・空白・「12.」・式は false */
export function isSizeText(text: string): boolean {
  return text === '' || SIZE_RE.test(text)
}

/** キーで入れている途中も含めて、数字だけの形か（数字と小数点1つまで。空・「12.」・「.」も true） */
export function isSizeInput(text: string): boolean {
  return INPUT_RE.test(text)
}

/**
 * W・H の欄に貼る文字（セルの貼り付け・オートフィル）。空は ''（空にする）、0 より大きい数（全角・余分な 0 も）はそろえた数字の文字、
 * それ以外（0・式・名前の文字・「12.」）は undefined（貼らない）
 */
export function pastedSize(text: string): string | undefined {
  const t = normalizeNumberText(text)
  if (t === '') return ''
  const r = readSize(t)
  return r.ok ? String(r.value) : undefined
}

/** 計算した値を保存する数字の文字にする（小数第1位に丸める。前のデータの式の置き換えで使う） */
export function sizeText(value: number): string {
  return String(round1(value))
}
