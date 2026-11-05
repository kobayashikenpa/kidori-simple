// 式の構文解析：字句 → 構文木（AST）。普通の四則演算の優先順位。先頭や ( の直後などの - は符号
// kidori の formula/parse.ts をもとに、材料の厚みを外したもの
import { adjustName } from '../defaults'
import type { Adjust, Axis } from '../types'
import { normalizeFormulaText, tokenize, type Operator, type Token } from './tokenize'

/** 式の構文木 */
export type Expr =
  | { type: 'number'; value: number }
  | { type: 'ref'; part: string; axis: Axis }
  | { type: 'adjust'; adjustId: string }
  | { type: 'neg'; arg: Expr }
  | { type: 'binary'; op: Operator; left: Expr; right: Expr }

/** 式の計算で起こるエラー */
export interface FormulaError {
  kind: 'syntax' | 'unknownRef' | 'divideByZero' | 'unknownAdjust'
  /** 画面にそのまま出せる日本語 */
  message: string
  /** unknownRef のときの部材名 */
  refs?: string[]
  /** syntax のとき、式の中の問題の位置 */
  start?: number
  end?: number
  /**
   * 入れている途中の形（第1.4版。仕様書 18.5）：空・終わりが記号（+ − × ÷）や「(」・かっこが閉じていない・「1.」で終わる。
   * 画面は入力中、この印のあるエラーを出さない（入力を終えたときに途中のままならエラーにする）
   */
  incomplete?: true
}

export type ParseResult = { ok: true; ast: Expr } | { ok: false; error: FormulaError }

class SyntaxFailure {
  readonly error: FormulaError
  constructor(error: FormulaError) {
    this.error = error
  }
}

const OP_LABELS: Readonly<Record<Operator, string>> = { '+': '+', '-': '−', '*': '×', '/': '÷' }

/** 式の終わりが記号か「(」のときの、後ろに入れるものの言い方（数字だけの式 size.ts は「後ろに数字を…」に言い換える） */
export const END_HINT = '後ろに数値か部材の寸法を入れてください'

/** 空の式のエラーの文 */
export const EMPTY_FORMULA_MESSAGE = '数値か式を入れてください'

/**
 * 字句の、画面に見えている書き方（第1.4版。仕様書 18.6）。
 * 数値はそろえた数字、参照は「全体.W」、調整寸法は表示名（メラミン1）、記号は + − × ÷ ( )。
 * 調整寸法は adjusts から引く（見つからなければ「（削除した調整寸法）」、adjusts を渡さなければ「調整寸法」）
 */
export function tokenLabel(tok: Token, expr: string, adjusts?: readonly Adjust[]): string {
  switch (tok.type) {
    case 'number':
      return normalizeFormulaText(expr.slice(tok.start, tok.end))
    case 'ref':
      return `${tok.part}.${tok.axis}`
    case 'adjust': {
      if (!adjusts) return '調整寸法'
      const a = adjusts.find((x) => x.id === tok.adjustId)
      return a ? adjustName(a) : '（削除した調整寸法）'
    }
    case '(':
    case ')':
      return tok.type
    default:
      return OP_LABELS[tok.type]
  }
}

/**
 * 式の文字列を構文木にする。例外は投げず、結果の型で返す。
 * エラーの文は画面に見えている言葉で書く（調整寸法の表示名は adjusts から。第1.4版。仕様書 18.6）。
 * 入れている途中の形（空・終わりが記号や「(」・かっこが閉じていない・「1.」）のエラーには incomplete を付ける（仕様書 18.5）
 */
export function parse(expr: string, adjusts?: readonly Adjust[]): ParseResult {
  const t = tokenize(expr)
  if (!t.ok) {
    return { ok: false, error: { kind: 'syntax', message: t.message, start: t.start, end: t.end, ...(t.incomplete ? { incomplete: true } : {}) } }
  }
  if (t.tokens.length === 0) return { ok: false, error: { kind: 'syntax', message: EMPTY_FORMULA_MESSAGE, incomplete: true } }

  const tokens = t.tokens
  let pos = 0
  const peek = (): Token | undefined => tokens[pos]
  const label = (tok: Token): string => tokenLabel(tok, expr, adjusts)
  const fail = (message: string, tok: Token | undefined, incomplete = false): never => {
    throw new SyntaxFailure({
      kind: 'syntax',
      message,
      start: tok?.start ?? expr.length,
      end: tok?.end ?? expr.length,
      ...(incomplete ? { incomplete: true } : {}),
    })
  }
  /** 値（数値・参照・調整寸法・かっこ）が2つ続いている：間に記号を入れてもらう */
  const missingOperator = (next: Token): never => {
    const prev = tokens[pos - 1]
    return fail(`「${label(prev)}」と「${label(next)}」の間に ＋ − × ÷ のどれかを入れてください`, next)
  }

  // 式 = 項 { (+|-) 項 }
  function parseSum(): Expr {
    let left = parseProduct()
    for (let tok = peek(); tok && (tok.type === '+' || tok.type === '-'); tok = peek()) {
      pos++
      left = { type: 'binary', op: tok.type, left, right: parseProduct() }
    }
    return left
  }

  // 項 = 因子 { (*|/) 因子 }
  function parseProduct(): Expr {
    let left = parseFactor()
    for (let tok = peek(); tok && (tok.type === '*' || tok.type === '/'); tok = peek()) {
      pos++
      left = { type: 'binary', op: tok.type, left, right: parseFactor() }
    }
    return left
  }

  // 因子 = - 因子 | 数値 | 参照 | 調整寸法 | ( 式 )
  function parseFactor(): Expr {
    const tok = peek()
    // 式の終わりが記号か「(」：入れている途中
    if (!tok) return fail(`式が「${label(tokens[tokens.length - 1])}」で終わっています（${END_HINT}）`, tok, true)
    switch (tok.type) {
      case '-':
        pos++
        return { type: 'neg', arg: parseFactor() }
      case 'number':
        pos++
        return { type: 'number', value: tok.value }
      case 'ref':
        pos++
        return { type: 'ref', part: tok.part, axis: tok.axis }
      case 'adjust':
        pos++
        return { type: 'adjust', adjustId: tok.adjustId }
      case '(': {
        pos++
        if (peek()?.type === ')') return fail('かっこ「( )」の中が空です', peek())
        const inner = parseSum()
        const next = peek()
        // かっこが閉じないまま終わった：入れている途中
        if (!next) return fail('閉じかっこ「)」が足りません', next, true)
        if (next.type !== ')') return missingOperator(next)
        pos++
        return inner
      }
      default: {
        // + × ÷ ) が、式の始め・記号や「(」のすぐ後ろにある
        const prev = tokens[pos - 1]
        if (!prev) return fail(`式の始めに「${label(tok)}」は置けません`, tok)
        return fail(`「${label(prev)}」のすぐ後ろに「${label(tok)}」は置けません`, tok)
      }
    }
  }

  try {
    const ast = parseSum()
    const rest = peek()
    if (rest) {
      if (rest.type === ')') fail('閉じかっこ「)」が多すぎます（対になる「(」がありません）', rest)
      missingOperator(rest)
    }
    return { ok: true, ast }
  } catch (e) {
    if (e instanceof SyntaxFailure) return { ok: false, error: e.error }
    throw e
  }
}

/** 式が入れている途中の形か（空・終わりが記号や「(」・かっこが閉じていない・「1.」。第1.4版。仕様書 18.5） */
export function isIncompleteFormula(expr: string): boolean {
  const p = parse(expr)
  return !p.ok && p.error.incomplete === true
}
