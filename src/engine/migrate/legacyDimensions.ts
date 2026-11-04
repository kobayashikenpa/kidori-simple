// 前の版（第2.1版まで）の寸法の計算：式（部材の寸法の参照・調整寸法・計算）の仕上がり寸法と木取り寸法、エラー。
// 第2.2版（仕様書 26章）で W・H は数字だけになったので、前のデータの式を数字に置き換えるとき（migrate/numbers.ts）だけに使う。
// 中身は第2.1版の dimensions/index.ts の computeDimensions のまま（kidori の dimensions/finished.ts・index.ts・cutSize.ts をもとにしたもの）
import { dimKey, resolve, type DimRef } from '../dimensions/resolve'
import { evaluate } from '../formula/evaluate'
import { normalizePartName } from '../formula/tokenize'
import { hasName, partLabels } from '../parts'
import { round1 } from '../round'
import {
  AXES,
  type Adjust,
  type Axis,
  type DimensionError,
  type DimensionResult,
  type Job,
  type PartDimensions,
} from '../types'

type Value = { ok: true; value: number } | { ok: false; error: DimensionError }

/**
 * 前の版の式で、全部材の仕上がり寸法・木取り寸法・エラーを求める（部材の並び順。置き換え専用）。
 * - 参照先の値は、いつもその部材の仕上がり寸法（式の計算結果。仕様書 5.1）
 * - 調整寸法 {n:id} は adjusts（アプリ全体の一覧）の寸法。無ければ unknownAdjust（削除した調整寸法）
 * - 計算結果が 0 以下（小数第1位に丸めて比べる）は nonPositive
 * - エラーのある寸法を参照している寸法は計算せず、元のエラーの寸法を from で示す
 * - 木取り寸法 ＝ 仕上がり ＋ settings.allowance（W・H それぞれに1回）。仕上がりが出ない軸は出さない
 * - finished・cut は W・H の両方が計算できたときだけ。片方だけのときは finishedByAxis・cutByAxis に入る
 * - 名前の無い部材も寸法を計算する（式からは参照できない）。name は表示用の名前（空なら #行番号）。枚数が空（null）の部材も計算する
 */
export function legacyComputeDimensions(job: Pick<Job, 'parts' | 'settings'>, adjusts: readonly Adjust[]): DimensionResult {
  const res = resolve(job.parts, adjusts)
  const adjustById = new Map(adjusts.map((a) => [a.id, a.value]))
  const allowance = job.settings.allowance
  // 全角・半角をそろえた部材名 → id（式の中の参照は、そろえた名前で出てくる）
  const idByName = new Map<string, string>()
  for (const p of job.parts) {
    if (!hasName(p)) continue
    const key = normalizePartName(p.name)
    if (!idByName.has(key)) idByName.set(key, p.id)
  }
  const ownErrors = new Map<string, DimensionError[]>()
  for (const e of res.errors) {
    const key = dimKey(e.partId, e.axis)
    ownErrors.set(key, [...(ownErrors.get(key) ?? []), e])
  }

  const memo = new Map<string, Value>()
  const labels = partLabels(job.parts)
  const label = (d: DimRef) => `${labels.get(d.partId)}.${d.axis}`

  /** 参照先のエラーを、参照している寸法のエラーとして伝える */
  const propagate = (d: DimRef, depError: DimensionError): DimensionError => {
    const origin = depError.from ?? { partId: depError.partId, axis: depError.axis }
    const originError = ownErrors.get(dimKey(origin.partId, origin.axis))?.[0] ?? depError
    return {
      partId: d.partId,
      axis: d.axis,
      kind: originError.kind,
      message: `参照している「${label(origin)}」が計算できません（${originError.message}）`,
      ...(originError.refs ? { refs: originError.refs } : {}),
      from: origin,
    }
  }

  const setOwnError = (d: DimRef, error: DimensionError): Value => {
    ownErrors.set(dimKey(d.partId, d.axis), [error])
    return { ok: false, error }
  }

  /** 仕上がり寸法。循環している寸法は resolve でエラーになっているので、ここで無限に辿ることはない */
  function finishedOf(d: DimRef): Value {
    const key = dimKey(d.partId, d.axis)
    const cached = memo.get(key)
    if (cached) return cached
    const result = compute(d, key)
    memo.set(key, result)
    return result
  }

  function compute(d: DimRef, key: string): Value {
    const own = ownErrors.get(key)
    if (own) return { ok: false, error: own[0] }
    const node = res.nodes.get(key)!
    // 参照先の値を先に計算する（エラーがあればそのエラーを伝える）
    const values = new Map<string, number>()
    for (const dep of node.deps) {
      const v = finishedOf(dep)
      if (!v.ok) return { ok: false, error: propagate(d, v.error) }
      values.set(dimKey(dep.partId, dep.axis), v.value)
    }
    const r = evaluate(node.ast!, {
      ref: (part, axis) => {
        const id = idByName.get(part)
        return id === undefined ? null : (values.get(dimKey(id, axis)) ?? null)
      },
      adjust: (adjustId) => adjustById.get(adjustId) ?? null,
    })
    if (!r.ok) {
      return setOwnError(d, {
        partId: d.partId,
        axis: d.axis,
        kind: r.error.kind,
        message: r.error.message,
        ...(r.error.refs ? { refs: r.error.refs } : {}),
      })
    }
    if (round1(r.value) <= 0) {
      return setOwnError(d, {
        partId: d.partId,
        axis: d.axis,
        kind: 'nonPositive',
        message: `計算結果が 0 以下になります（${signedText(round1(r.value))}）`,
      })
    }
    return { ok: true, value: r.value }
  }

  for (const d of res.order) finishedOf(d)

  const parts: PartDimensions[] = job.parts.map((p) => {
    const finishedByAxis: Partial<Record<Axis, number>> = {}
    const cutByAxis: Partial<Record<Axis, number>> = {}
    const errors: DimensionError[] = []
    for (const axis of AXES) {
      const f = finishedOf({ partId: p.id, axis })
      if (f.ok) {
        finishedByAxis[axis] = f.value
        cutByAxis[axis] = f.value + allowance
      } else {
        errors.push(...(ownErrors.get(dimKey(p.id, axis)) ?? [f.error]))
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

/** 数を画面の書き方で（マイナスは −。例：−200） */
function signedText(v: number): string {
  return v < 0 ? `−${-v}` : String(v)
}

function isComplete(r: Partial<Record<Axis, number>>): r is Record<Axis, number> {
  return AXES.every((a) => r[a] !== undefined)
}
