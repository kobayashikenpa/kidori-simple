// 部材の表示用の名前と、名前・枚数が空の部材の扱い（第1.1版。仕様書 15.1）
// - 名前は空でもよい。空の部材は画面で「#3」（job.parts の並びで 1 から数えた行番号）と出す
// - 枚数が空（quantity: null）の部材は、寸法は計算するが木取り・必要な枚数・進み具合・比べに入れない
import type { Job, Part } from './types'

/** 名前があるか（前後の空白を外して空でない） */
export function hasName(part: Pick<Part, 'name'>): boolean {
  return part.name.trim() !== ''
}

/** 表示用の名前：名前があれば名前、空なら「#行番号」。index は job.parts の中の位置（0 から） */
export function partLabelAt(part: Pick<Part, 'name'>, index: number): string {
  return hasName(part) ? part.name : `#${index + 1}`
}

/** 部材の id → 表示用の名前（partLabelAt）。たくさんの部材の名前を出すときに使う */
export function partLabels(parts: readonly Pick<Part, 'id' | 'name'>[]): Map<string, string> {
  return new Map(parts.map((p, i) => [p.id, partLabelAt(p, i)]))
}

/** 部材の表示用の名前（名前が空なら「#行番号」）。部材が無ければ空の文字 */
export function partLabel(job: Pick<Job, 'parts'>, partId: string): string {
  const i = job.parts.findIndex((p) => p.id === partId)
  return i < 0 ? '' : partLabelAt(job.parts[i], i)
}

/** 切り出す枚数。枚数が空（null）と 0（寸法だけの行）は 0 */
export function cutQuantity(quantity: number | null): number {
  return quantity ?? 0
}

/** 何も入っていない部材か（名前・W・H が空で、枚数も空）。この部材は表から外す（保存しない）。回転・仕上がりの完了は見ない */
export function isBlankPart(part: Pick<Part, 'name' | 'expr' | 'quantity'>): boolean {
  return part.name.trim() === '' && part.expr.W.trim() === '' && part.expr.H.trim() === '' && part.quantity === null
}
