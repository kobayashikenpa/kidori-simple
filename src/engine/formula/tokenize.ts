// 式の字句の切り出し：数値・参照（部材名.W/H）・調整寸法 {n:調整寸法のid}・記号（+ - * / ( )）。先頭の「＝」は読み飛ばす（第1.6版）
// kidori の formula/tokenize.ts をもとに、軸を W・H だけにし、材料の厚み {t:…} を外したもの
import { AXES, type Axis } from '../types'

export type Operator = '+' | '-' | '*' | '/'

interface TokenBase {
  /** 式の中の開始位置（文字の番号、0 から） */
  start: number
  /** 式の中の終了位置（この位置の文字は含まない） */
  end: number
}

export type Token =
  | (TokenBase & { type: 'number'; value: number })
  | (TokenBase & { type: 'ref'; part: string; axis: Axis })
  | (TokenBase & { type: 'adjust'; adjustId: string })
  | (TokenBase & { type: Operator | '(' | ')' })

export type TokenizeResult =
  | { ok: true; tokens: Token[] }
  /** incomplete：入れている途中の形（式の終わりが「1.」のように小数点で終わっている。第1.4版。仕様書 18.5） */
  | { ok: false; message: string; start: number; end: number; incomplete?: true }

/** 部材名に使えない記号（式の区切りになる文字） */
const SYMBOLS = ['+', '-', '*', '/', '(', ')'] as const
const SYMBOL_SET: ReadonlySet<string> = new Set(SYMBOLS)

const NUMBER_RE = /^\d+(?:\.\d+)?$/
/** 小数点まで入れて、その後ろの数字をまだ入れていない数（1.） */
const OPEN_DECIMAL_RE = /^\d+\.$/

/** 1文字をそろえたうえで { か（全角の ｛ も） */
function isOpenBrace(ch: string): boolean {
  return normalizeFormulaText(ch) === '{'
}

/** 1文字をそろえたうえで } か（全角の ｝ も） */
function isCloseBrace(ch: string): boolean {
  return normalizeFormulaText(ch) === '}'
}

function isSpace(ch: string): boolean {
  return /\s/.test(ch)
}

/**
 * 入力の揺れをそろえる：全角の数字・記号・英字を半角に（NFKC）、× ✕ を *、÷ を /、− – — を - に。
 * 長音の ー は部材名に使うため置き換えない
 */
export function normalizeFormulaText(text: string): string {
  return text.normalize('NFKC').replace(/[×✕]/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-')
}

/** 1文字をそろえたうえで、式の記号（+ - * / ( )）ならその記号、でなければ null */
function symbolOf(ch: string): Operator | '(' | ')' | null {
  const n = normalizeFormulaText(ch)
  return SYMBOL_SET.has(n) ? (n as Operator | '(' | ')') : null
}

/** 先頭の空白と「＝」（全角 ＝・半角 =）1つの後ろの位置。「＝」が無ければ 0 */
function leadingEqualsEnd(expr: string): number {
  let i = 0
  while (i < expr.length && isSpace(expr[i])) i++
  return i < expr.length && normalizeFormulaText(expr[i]) === '=' ? i + 1 : 0
}

/** 記号と空白で区切った「ひとかたまり」の文字列。記号・空白以外が続く部分 */
export interface Chunk {
  text: string
  start: number
  end: number
}

/**
 * 式を、記号・空白・ひとかたまりの文字列に分ける。失敗しない。
 * 全角の記号（＋ など）も記号として扱う。位置とかたまりの文字列は入力したまま。
 * { から次の } までは、中に記号や空白があっても1つのかたまりにする（} が無ければ式の終わりまで）。
 * 字句の切り出しと、部材名のつけ替え（rename）の両方で使う
 */
export function splitChunks(expr: string): (Token | Chunk)[] {
  const order: (Token | Chunk)[] = []
  // 先頭の「＝」（エクセルと同じく「＝」で始めた式。第1.6版 仕様書 20.2）は読み飛ばす
  let i = leadingEqualsEnd(expr)
  while (i < expr.length) {
    const ch = expr[i]
    if (isSpace(ch)) {
      i++
      continue
    }
    const sym = symbolOf(ch)
    if (sym) {
      order.push({ type: sym, start: i, end: i + 1 })
      i++
      continue
    }
    const start = i
    if (isOpenBrace(ch)) {
      i++
      while (i < expr.length && !isCloseBrace(expr[i])) i++
      if (i < expr.length) i++
      order.push({ text: expr.slice(start, i), start, end: i })
      continue
    }
    while (i < expr.length && !isSpace(expr[i]) && !symbolOf(expr[i]) && !isOpenBrace(expr[i])) i++
    order.push({ text: expr.slice(start, i), start, end: i })
  }
  return order
}

/**
 * ひとかたまりの文字列を、参照「部材名.W/H」として読む。読めなければ null（天板.D なども null）。
 * 部材名には . を使えないので、. はちょうど1つ。その前が部材名、後ろが軸。
 * 全角はそろえてから読むので、返す部材名はそろえた後の名前（normalizePartName と同じ形）
 */
function parseRefText(raw: string): { part: string; axis: Axis } | null {
  const text = normalizeFormulaText(raw)
  const dot = text.indexOf('.')
  if (dot <= 0 || dot !== text.lastIndexOf('.')) return null
  const part = text.slice(0, dot)
  const axis = text.slice(dot + 1)
  if (!(AXES as readonly string[]).includes(axis)) return null
  return { part, axis: axis as Axis }
}

/** 調整寸法のかたまりか（{ で始まるか。全角の ｛ も） */
export function isBraceText(raw: string): boolean {
  return raw.length > 0 && isOpenBrace(raw[0])
}

const BRACE_RE = /^\{n:([^{}\s]+)\}$/

/**
 * かたまりの文字列を、調整寸法 {n:調整寸法のid} として読む。読めなければ null（kidori の材料の厚み {t:…} も null）。
 * 全角の ｛ ｝ はそろえてから読む
 */
export function parseBraceText(raw: string): { kind: 'adjust'; id: string } | null {
  const m = BRACE_RE.exec(normalizeFormulaText(raw))
  if (!m) return null
  return { kind: 'adjust', id: m[1] }
}

/** 部材名.D のような、W・H 以外の軸を書いた参照か（部材名.X の形で、. の後ろが英字） */
function isOtherAxisRef(raw: string): boolean {
  return /^[^.]+\.[A-Za-z]+$/.test(normalizeFormulaText(raw))
}

/**
 * 式を字句に分ける。例外は投げず、読めない部分があればその位置とメッセージ（画面に見えている言葉。第1.4版）を返す。
 * 式の終わりが「1.」（小数点の後ろの数字がまだ）なら、入れている途中の印 incomplete を付ける
 */
export function tokenize(expr: string): TokenizeResult {
  const tokens: Token[] = []
  const items = splitChunks(expr)
  for (const [index, item] of items.entries()) {
    if ('type' in item) {
      tokens.push(item)
      continue
    }
    const { text, start, end } = item
    if (isBraceText(text)) {
      const b = parseBraceText(text)
      if (!b) {
        const closed = isCloseBrace(text[text.length - 1]) && text.length > 1
        return {
          ok: false,
          message: closed
            ? `「${text}」は読めない参照です（調整寸法はキーの「調整寸法」から入れ直してください）`
            : `「${text}」が読めません（調整寸法はキーの「調整寸法」から入れ直してください）`,
          start,
          end,
        }
      }
      tokens.push({ type: 'adjust', adjustId: b.id, start, end })
      continue
    }
    const normalized = normalizeFormulaText(text)
    if (NUMBER_RE.test(normalized)) {
      tokens.push({ type: 'number', value: Number(normalized), start, end })
      continue
    }
    if (OPEN_DECIMAL_RE.test(normalized) && index === items.length - 1) {
      return { ok: false, message: `「${normalized}」の小数点の後ろに数字を入れてください`, start, end, incomplete: true }
    }
    const ref = parseRefText(text)
    if (ref) {
      tokens.push({ type: 'ref', part: ref.part, axis: ref.axis, start, end })
      continue
    }
    if (isOtherAxisRef(text)) {
      return { ok: false, message: `「${text}」は使えません（寸法は W・H だけです。「部材名.W」「部材名.H」で書いてください）`, start, end }
    }
    // 部材名だけ（.W・.H が無い）
    if (!normalized.includes('.') && /\p{L}/u.test(normalized) && validatePartName(text) === null) {
      return { ok: false, message: `「${text}」が読めません（部材の寸法は「${text}.W」「${text}.H」のように書きます）`, start, end }
    }
    return { ok: false, message: `「${text}」が読めません（数値か「部材名.W」「部材名.H」で書いてください）`, start, end }
  }
  return { ok: true, tokens }
}

/** 部材名を、式の中の参照と比べられる形にそろえる（全角・半角の違いをなくす） */
export function normalizePartName(name: string): string {
  return normalizeFormulaText(name)
}

/**
 * 部材名に使えるかを調べる。使えれば null、使えなければ理由（日本語）を返す。
 * 式の区切りになる記号（+ - * / ( ) . { }）と空白は使えない（全角の ＋ や × ÷ − なども、式では記号になるので使えない）。
 * otherNames と同じ名前（全角・半角の違いだけのものも含む）も使えない。
 * 空の名前は使える（第1.1版。仕様書 15.1）。空の名前どうしは重なりとみなさない
 */
export function validatePartName(name: string, otherNames: readonly string[] = []): string | null {
  // 空の名前はよい（第1.1版。空どうしは重ならない）
  if (name.length === 0) return null
  if ([...name].some((ch) => isSpace(ch) || isSpace(normalizeFormulaText(ch)))) return '部材名に空白は使えません'
  const bad = [...name].find((ch) => [...normalizeFormulaText(ch)].some((n) => SYMBOL_SET.has(n) || n === '.'))
  if (bad !== undefined) return `部材名に「${bad}」は使えません（+ - * / ( ) . × ÷ は式で使う記号のため）`
  const brace = [...name].find((ch) => isOpenBrace(ch) || isCloseBrace(ch))
  if (brace !== undefined) return `部材名に「${brace}」は使えません（{ } は式で調整寸法を表すため）`
  const key = normalizePartName(name)
  const same = otherNames.find((n) => n.trim() !== '' && normalizePartName(n) === key)
  if (same !== undefined) return `「${same}」という部材はすでにあります`
  return null
}
