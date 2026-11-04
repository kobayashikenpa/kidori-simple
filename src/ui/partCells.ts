// 部材の表の W・H の欄に出すもの（仕様書 5.2・26.1）。計算はせず、engine の計算結果（computeDimensions）を並べるだけ。
// 第2.2版で W・H は数字だけになったので、式の表示（式 ｜ 計算した寸法・ƒ）はなくした
import type { Axis, PartDimensions } from '../engine/types'
import type { PartsTab } from './partsTab'

export type DimCell =
  /** 寸法：仕上がりのタブは仕上がり寸法、木取りのタブは木取り寸法 */
  | { kind: 'number'; value: number }
  /** 寸法のエラー（0 以下・入れている途中の「12.」など）：赤で「エラー」。messages は engine の理由 */
  | { kind: 'error'; messages: string[] }

/** 1つの欄。仕上がりのタブは仕上がり寸法、木取りのタブは木取り寸法 */
export function dimCell(dims: PartDimensions | undefined, axis: Axis, tab: PartsTab): DimCell {
  const errors = dims?.errors.filter((e) => e.axis === axis) ?? []
  const value = tab === 'finished' ? dims?.finishedByAxis[axis] : dims?.cutByAxis[axis]
  if (errors.length > 0 || value === undefined) {
    const messages = [...new Set(errors.map((e) => e.message))]
    return { kind: 'error', messages: messages.length > 0 ? messages : ['計算できません'] }
  }
  return { kind: 'number', value }
}
