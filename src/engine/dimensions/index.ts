// 寸法の計算：仕上がり寸法（入れた数字）と木取り寸法（仕上がり ＋ 切り代）、エラー。
// 第2.2版（仕様書 26.1）で W・H は数字だけになった（式・調整寸法・部材の寸法の参照はなくした）。
// 前の版の式の計算は migrate/legacyDimensions.ts（前のデータを数字に置き換えるときだけ使う）
import { partLabels } from '../parts'
import { readSize } from '../size'
import { AXES, type Axis, type DimensionError, type DimensionResult, type Job, type PartDimensions } from '../types'

/**
 * 全部材の仕上がり寸法・木取り寸法・エラーを求める（部材の並び順）。
 * - 仕上がり寸法 ＝ W・H に入れた数字（size.ts の readSize）。空・「12.」は入れている途中（incomplete）、0 以下・数字でないものはエラー
 * - 木取り寸法 ＝ 仕上がり ＋ settings.allowance（W・H それぞれに1回）。仕上がりが出ない軸は出さない
 * - finished・cut は W・H の両方が出たときだけ。片方だけのときは finishedByAxis・cutByAxis に入る
 * - name は表示用の名前（空なら #行番号）。枚数が空（null）の部材も計算する
 */
export function computeDimensions(job: Pick<Job, 'parts' | 'settings'>): DimensionResult {
  const allowance = job.settings.allowance
  const labels = partLabels(job.parts)
  const parts: PartDimensions[] = job.parts.map((p) => {
    const finishedByAxis: Partial<Record<Axis, number>> = {}
    const cutByAxis: Partial<Record<Axis, number>> = {}
    const errors: DimensionError[] = []
    for (const axis of AXES) {
      const r = readSize(p.expr[axis])
      if (r.ok) {
        finishedByAxis[axis] = r.value
        cutByAxis[axis] = r.value + allowance
      } else {
        errors.push({ partId: p.id, axis, kind: r.kind, message: r.message, ...(r.incomplete ? { incomplete: true as const } : {}) })
      }
    }
    return {
      partId: p.id,
      name: labels.get(p.id)!,
      quantity: p.quantity,
      finished: isComplete(finishedByAxis) ? finishedByAxis : null,
      cut: isComplete(cutByAxis) ? cutByAxis : null,
      finishedByAxis,
      cutByAxis,
      errors,
    }
  })
  return { parts, errors: parts.flatMap((p) => p.errors) }
}

function isComplete(r: Partial<Record<Axis, number>>): r is Record<Axis, number> {
  return AXES.every((a) => r[a] !== undefined)
}
