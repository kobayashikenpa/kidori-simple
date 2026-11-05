// 幅・長さ（W・H）の数字と数字だけの式をアプリのキーだけで編集する操作。計算はしない。
// - 第2.2版（仕様書 26.1）：数字だけ
// - 第2.3版（仕様書 27.1・27.2）：＋ − × ÷ ( ) のキーを戻した。記号は保存の形（半角の + - * / ( )）で文字に足す。画面には engine の sizeLabel で × ÷ − と出す
// カーソルは文字の位置（0〜文字の数。k は k 文字目の前）。◀ ▶ で1字ずつ動く。
// 入れたあとの形は engine の isSizeInput（入れている途中の「450-」「(900」「12.」も通す）
import { isSizeInput } from '../engine/size'

export interface SizeEdit {
  text: string
  /** 編集後のカーソル（文字の位置） */
  cursor: number
}

/** 式の記号のキー（保存の形の半角の文字。画面では ＋ − × ÷ ( ) と出す） */
export type SizeOpKey = '+' | '-' | '*' | '/' | '(' | ')'

/** 幅・長さのキー（数字・小数点・式の記号・1字消す・全部消す・◀ ▶） */
export type SizeKey = `${number}` | '.' | SizeOpKey | 'back' | 'clear' | 'left' | 'right'

/** 1つの数（数字と小数点が続く所）に入れられる文字の数（小数点を含む。設定の数字キー numpad.ts と同じ。暫定） */
export const SIZE_MAX_LEN = 8

/** 式の全体に入れられる文字の数（暫定。第2.3版。表の上の欄に1行で収まる長さ） */
export const SIZE_FORMULA_MAX_LEN = 30

const OPS: ReadonlySet<string> = new Set<SizeOpKey>(['+', '-', '*', '/', '(', ')'])

const clamp = (cursor: number, n: number): number => Math.max(0, Math.min(n, Math.floor(cursor)))

/** 式の中の数のかたまり（数字と小数点が続く所） */
const chunks = (text: string): string[] => text.split(/[^\d.]+/).filter((c) => c !== '')

/**
 * カーソルの位置に1字（数字・小数点・式の記号）を入れる。入れると入れられる形でなくなる・長すぎるときは変えない。
 * 数の始めの小数点は「0.」にし（.5 → 0.5、450−. → 450−0.）、数の始めの余分な 0 は外す（0 のあとに 5 → 5、450−05 → 450−5）
 */
function insertChar(text: string, cursor: number, ch: string): SizeEdit {
  const k = clamp(cursor, text.length)
  const ins = ch === '.' && !/\d/.test(text[k - 1] ?? '') ? '0.' : ch
  let next = text.slice(0, k) + ins + text.slice(k)
  let at = k + ins.length
  if (/^\d$/.test(ch)) {
    // 入れた数字の数のかたまりの始め
    let s = k
    while (s > 0 && /[\d.]/.test(next[s - 1])) s--
    if (next[s] === '0' && /\d/.test(next[s + 1] ?? '')) {
      next = next.slice(0, s) + next.slice(s + 1)
      if (at > s) at -= 1
    }
  }
  if (next.length > SIZE_FORMULA_MAX_LEN || chunks(next).some((c) => c.length > SIZE_MAX_LEN) || !isSizeInput(next)) {
    return { text, cursor: k }
  }
  return { text: next, cursor: at }
}

/** キーを1つ押したあとの文字とカーソル */
export function pressSizeKey(text: string, cursor: number, key: SizeKey): SizeEdit {
  const k = clamp(cursor, text.length)
  switch (key) {
    case 'back':
      return k === 0 ? { text, cursor: 0 } : { text: text.slice(0, k - 1) + text.slice(k), cursor: k - 1 }
    case 'clear':
      return { text: '', cursor: 0 }
    case 'left':
      return { text, cursor: clamp(k - 1, text.length) }
    case 'right':
      return { text, cursor: clamp(k + 1, text.length) }
    default:
      return /^\d$/.test(key) || key === '.' || OPS.has(key) ? insertChar(text, k, key) : { text, cursor: k }
  }
}
