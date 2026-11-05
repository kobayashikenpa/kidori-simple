// W・H の数字をアプリのキーだけで編集する操作（第2.2版。仕様書 26.1：W・H は数字だけ）。計算はしない。
// カーソルは文字の位置（0〜文字の数。k は k 文字目の前）。◀ ▶ で1字ずつ動く。
// 入れたあとの形は engine の isSizeInput（第2.3版で ＋ − × ÷ ( ) も通すようになった。このキーは数字と小数点だけなので、数字の形のまま。
// 式のキーは U-28 で足す）
import { isSizeInput } from '../engine/size'

export interface SizeEdit {
  text: string
  /** 編集後のカーソル（文字の位置） */
  cursor: number
}

/** W・H のキー（数字・小数点・1字消す・全部消す・◀ ▶） */
export type SizeKey = `${number}` | '.' | 'back' | 'clear' | 'left' | 'right'

/** 入れられる文字の数（小数点を含む。設定の数字キー numpad.ts と同じ。暫定） */
export const SIZE_MAX_LEN = 8

const clamp = (cursor: number, n: number): number => Math.max(0, Math.min(n, Math.floor(cursor)))

/** カーソルの位置に1字（数字か小数点）を入れる。入れると数字の形でなくなる・長すぎるときは変えない */
function insertChar(text: string, cursor: number, ch: string): SizeEdit {
  const k = clamp(cursor, text.length)
  let next = text.slice(0, k) + ch + text.slice(k)
  let at = k + 1
  // 先頭の小数点は「0.」にする（.5 → 0.5）
  if (next.startsWith('.')) {
    next = `0${next}`
    at += 1
  }
  // 先頭の余分な 0 は外す（0 のあとに 5 → 5）
  if (/^0\d/.test(next)) {
    next = next.slice(1)
    at = Math.max(0, at - 1)
  }
  if (next.length > SIZE_MAX_LEN || !isSizeInput(next)) return { text, cursor: k }
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
      return /^\d$/.test(key) || key === '.' ? insertChar(text, k, key) : { text, cursor: k }
  }
}
