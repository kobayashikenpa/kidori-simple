// 部材の W・H の寸法の文字。
// - 第2.2版（仕様書 26.1）：数字だけ。式・調整寸法はなくした
// - 第2.3版（仕様書 27.1・27.4）：数字と ＋ − × ÷ ( ) だけの計算式（450-50 など）を戻した。部材名・調整寸法の参照は無いまま
// 保存の形は今までと同じ文字（Part.expr）のまま、中身を「空・数字・数字だけの式」にする（tasks.md 第2.2版・第2.3版の未決事項）。
// 式の計算は formula/ の parse・evaluate を使う（参照は受け付けない：使える文字を先に確かめる）
import { evaluate } from './formula/evaluate'
import { END_HINT, parse } from './formula/parse'
import { normalizeFormulaText } from './formula/tokenize'
import { round1 } from './round'

/** 保存する W・H の数字の形：半角の数字（小数可） */
const SIZE_RE = /^\d+(?:\.\d+)?$/
/** 数字だけの式に使える文字（そろえたあと）：数字・小数点・+ - * / ( )・空白 */
const INPUT_CHARS_RE = /^[\d.+\-*/()\s]*$/
/** 式の記号（そろえたあと） */
const SYMBOL_RE = /[+\-*/()]/

/** 数字の欄の文字をそろえる（全角の数字・小数点を半角に、前後の空白を外す） */
function normalizeNumberText(text: string): string {
  return text.normalize('NFKC').trim()
}

/** 式の中の数のかたまり（数字と小数点が続く所）。記号・空白で区切る */
function numberChunks(normalized: string): string[] {
  return normalized.split(/[^\d.]+/).filter((c) => c !== '')
}

export type SizeRead =
  | { ok: true; value: number }
  /**
   * incomplete：入れている途中の形（空・「12.」・式の終わりが記号や「(」・かっこが閉じていない）。画面は入力中に出さない。
   * divideByZero は式で 0 で割ったとき（第2.3版）
   */
  | { ok: false; kind: 'syntax' | 'nonPositive' | 'divideByZero'; message: string; incomplete?: true }

export const EMPTY_SIZE_MESSAGE = '数字を入れてください'
export const NON_POSITIVE_SIZE_MESSAGE = '0 より大きい数を入れてください'

/** 数を画面の書き方で（マイナスは −。例：−50） */
function signedText(v: number): string {
  return v < 0 ? `−${-v}` : String(v)
}

/** 数字だけの式を計算する（使える文字は確かめたあと。t は前後の空白を外した文字） */
function readFormula(t: string): SizeRead {
  const f = normalizeFormulaText(t)
  // 数のかたまり：「1.2.3」「.5」は読めない。最後の「12.」「.」は入れている途中
  const chunks = numberChunks(f)
  const endsWithChunk = /[\d.]$/.test(f.trimEnd())
  for (const [i, c] of chunks.entries()) {
    if (SIZE_RE.test(c)) continue
    if (i === chunks.length - 1 && endsWithChunk && /^\d*\.$/.test(c)) {
      return { ok: false, kind: 'syntax', message: `「${c}」の小数点の後ろに数字を入れてください`, incomplete: true }
    }
    return { ok: false, kind: 'syntax', message: `「${c}」は数字として読めません` }
  }
  const p = parse(f)
  if (!p.ok) {
    // parse の文は前の版の式（部材の寸法も使えた）向けなので、終わりが記号のときの言い方だけ数字の式に合わせる
    const message = p.error.message.replace(END_HINT, '後ろに数字を入れてください')
    return { ok: false, kind: 'syntax', message, ...(p.error.incomplete ? { incomplete: true as const } : {}) }
  }
  // 参照は使える文字の確かめで入らないので、引く先は無い（来ても null＝エラー）
  const r = evaluate(p.ast, { ref: () => null, adjust: () => null })
  if (!r.ok) {
    if (r.error.kind === 'divideByZero') return { ok: false, kind: 'divideByZero', message: r.error.message }
    return { ok: false, kind: 'syntax', message: r.error.message }
  }
  if (!Number.isFinite(r.value)) return { ok: false, kind: 'syntax', message: '数が大きすぎて計算できません' }
  if (round1(r.value) <= 0) return { ok: false, kind: 'nonPositive', message: `計算結果が 0 以下になります（${signedText(round1(r.value))}）` }
  return { ok: true, value: r.value }
}

/**
 * 保存した W・H の文字を寸法として読む。
 * - 空：「数字を入れてください」（途中の印）
 * - 「12.」「.」：小数点の後ろがまだ（途中の印）
 * - 数字：その数。0 と、小数第1位に丸めて 0 になる数は 0 以下（仕様書 26.1）
 * - 数字と ＋ − × ÷ ( ) だけの式（第2.3版。仕様書 27.1）：計算した値（丸めない）。× ÷ が先、( ) の中が先、先頭や ( の直後の − は符号。
 *   計算できない式は syntax（終わりが記号・かっこが閉じていない・最後が「12.」は途中の印つき）、0 で割るのは divideByZero、
 *   結果が 0 以下（小数第1位に丸めて）は nonPositive
 * - それ以外（部材の寸法・調整寸法・「＝」・ほかの文字）：使えない
 * 全角の数字・記号、× ÷ −（U+2212）、空白はそろえて読む。「＝」は付けない
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
  if (!INPUT_CHARS_RE.test(normalizeFormulaText(t))) {
    return { ok: false, kind: 'syntax', message: `「${text.trim()}」は使えません（幅・長さは、数字と ＋ − × ÷ ( ) の式だけです）` }
  }
  return readFormula(t)
}

/**
 * W・H に入れられる形か（キーで入れている途中も含む）：数字・小数点（1つの数に1つまで）・＋ − × ÷ ( )・空白だけ。
 * 「12.」「.」「450-」「(」のような途中の形も true。全角・× ÷ −（U+2212）もそろえて見る。部材の寸法・調整寸法・「＝」は false。
 * 前のデータの置き換え（migrate/numbers.ts）では、これが false のものを「置き換える式」とする
 */
export function isSizeInput(text: string): boolean {
  const f = normalizeFormulaText(text)
  if (!INPUT_CHARS_RE.test(f)) return false
  return numberChunks(f).every((c) => c.indexOf('.') === c.lastIndexOf('.'))
}

/** 式か（W・H に入れられる形で、＋ − × ÷ ( ) が入っている）。画面の ƒ の印に使う。数字・空・「12.」は false */
export function isSizeFormula(text: string): boolean {
  return isSizeInput(text) && SYMBOL_RE.test(normalizeFormulaText(text))
}

/** 保存する形にそろえる：全角を半角に、× ✕ を *、÷ を /、− – — を -、空白を外す（貼り付け・前のデータの「＝」を外した式） */
export function normalizeSizeText(text: string): string {
  return normalizeFormulaText(text).replace(/\s+/g, '')
}

/** 画面に出す式の書き方：* を ×、/ を ÷、- を −（1字は1字のまま置き換えるので、文字の位置＝カーソルの位置は変わらない） */
export function sizeLabel(text: string): string {
  return text.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−')
}

/** 表示する値（小数第1位まで。数字も式も）。エラー（空・途中・計算できない・0 以下）は null */
export function sizeValueText(text: string): string | null {
  const r = readSize(text)
  return r.ok ? sizeText(r.value) : null
}

/**
 * W・H の欄に貼る文字（セルの貼り付け・オートフィル。仕様書 27.4）。
 * - 空は ''（空にする）
 * - 0 より大きい数（全角・余分な 0 も）はそろえた数字の文字
 * - 値が 0 より大きい数字だけの式は、式のまま（normalizeSizeText でそろえた形）
 * - それ以外（0・0 以下になる式・計算できない式・0 で割る式・部材の寸法・名前の文字・「12.」）は undefined（貼らない）
 */
export function pastedSize(text: string): string | undefined {
  const t = normalizeNumberText(text)
  if (t === '') return ''
  const r = readSize(t)
  if (!r.ok) return undefined
  return isSizeFormula(t) ? normalizeSizeText(t) : String(r.value)
}

/** 計算した値を保存する数字の文字にする（小数第1位に丸める。前のデータの式の置き換えで使う） */
export function sizeText(value: number): string {
  return String(round1(value))
}
