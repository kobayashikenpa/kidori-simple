// 部材の並べ替えと行の移動（第2.0版。仕様書 24）。
// - 並べ替え：W・H は仕上がり寸法、枚数、名前（あいうえお順）で比べる。空・エラーの部材は、大きい順・小さい順のどちらでも一番下。
//   値が同じ部材は今の並びのまま（安定）
// - 行の移動：続いた行（from から count 行）を、別の位置（元の並びの行と行の間）へ動かす
// どちらも部材の中身（寸法・枚数・回転・切り出しチェックの記録）は変えず、並びだけを変える。名前の無い部材の「#3」は新しい行の番号になる
import type { Axis, DimensionResult, Part } from './types'

/** 並べ替えに使う列 */
export type SortKey = 'name' | 'W' | 'H' | 'qty'

/** 並べる向き：asc は小さい順（名前はあいうえお順）、desc は大きい順（名前は逆の順） */
export type SortOrder = 'asc' | 'desc'

const collator = new Intl.Collator('ja', { numeric: true }) // 名前の中の数字は大きさで比べる（棚板2 → 棚板10）

/** 部材の比べる値。空・エラーなら null（一番下に置く） */
function sortValue(part: Part, dims: DimensionResult, key: SortKey): number | string | null {
  if (key === 'name') {
    const name = part.name.trim()
    return name === '' ? null : name
  }
  if (key === 'qty') return part.quantity
  const axis: Axis = key
  if (part.expr[axis].trim() === '') return null
  const d = dims.parts.find((x) => x.partId === part.id)
  if (!d || d.errors.some((e) => e.axis === axis)) return null
  return d.finishedByAxis[axis] ?? null
}

/**
 * 部材を並べ替える（新しい配列を返す。元は書き換えない）。dims は computeDimensions(job) の結果（W・H の仕上がり寸法に使う）。
 * 空・エラーの部材は一番下（その中は今の並び）。値が同じ部材は今の並びのまま
 */
export function sortParts(parts: readonly Part[], dims: DimensionResult, key: SortKey, order: SortOrder): Part[] {
  const sign = order === 'asc' ? 1 : -1
  const items = parts.map((part, index) => ({ part, index, value: sortValue(part, dims, key) }))
  items.sort((a, b) => {
    if (a.value === null || b.value === null) {
      if (a.value === null && b.value === null) return a.index - b.index
      return a.value === null ? 1 : -1
    }
    const c =
      typeof a.value === 'string' && typeof b.value === 'string'
        ? collator.compare(a.value, b.value)
        : (a.value as number) - (b.value as number)
    return c !== 0 ? c * sign : a.index - b.index
  })
  return items.map((x) => x.part)
}

/** 並びが同じか（同じ部材が同じ順） */
export function sameOrder(a: readonly Part[], b: readonly Part[]): boolean {
  return a.length === b.length && a.every((p, i) => p.id === b[i].id)
}

/**
 * 続いた行（from から count 行）を、元の並びの to の位置（to 行目の上。0〜部材の数。部材の数なら一番下）へ動かす（新しい配列を返す）。
 * 範囲の外の行は数えない（from・count は部材のある行に収める）。動かす先が動かす行の中・すぐ上・すぐ下なら並びは変わらない
 */
export function moveParts(parts: readonly Part[], from: number, count: number, to: number): Part[] {
  const n = parts.length
  const start = Math.max(0, Math.min(from, n))
  const end = Math.max(start, Math.min(from + count, n))
  const gap = Math.max(0, Math.min(to, n))
  if (end === start || (gap >= start && gap <= end)) return [...parts]
  const block = parts.slice(start, end)
  const rest = [...parts.slice(0, start), ...parts.slice(end)]
  const at = gap < start ? gap : gap - block.length
  return [...rest.slice(0, at), ...block, ...rest.slice(at)]
}

/** moveParts で動かしたあと、動かした行の一番上の行の番号（0 から）。並びが変わらないときは元の from（部材のある行に収めた値） */
export function movedTop(length: number, from: number, count: number, to: number): number {
  const start = Math.max(0, Math.min(from, length))
  const end = Math.max(start, Math.min(from + count, length))
  const gap = Math.max(0, Math.min(to, length))
  if (end === start || (gap >= start && gap <= end)) return start
  return gap < start ? gap : gap - (end - start)
}
