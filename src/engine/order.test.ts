// 部材の並べ替えと行の移動（第2.0版。仕様書 24）
import { describe, expect, it } from 'vitest'
import { computeDimensions } from './dimensions'
import { shelfJob } from './fixtures/shelf'
import { movedTop, moveParts, sameOrder, sortParts } from './order'
import { partLabels } from './parts'
import type { Job, Part } from './types'

function part(id: string, name: string, W: string, H: string, quantity: number | null): Part {
  return { id, name, expr: { W, H }, quantity, rotatable: false, finishedDone: false }
}

/** 見本の棚の後ろに部材を足した写し */
function withParts(...parts: Part[]): Job {
  const job = shelfJob()
  return { ...job, parts: [...job.parts, ...parts] }
}

const ids = (parts: readonly Part[]) => parts.map((p) => p.id)
const sorted = (job: Job, key: 'name' | 'W' | 'H' | 'qty', order: 'asc' | 'desc') =>
  ids(sortParts(job.parts, computeDimensions(job), key, order))

describe('並べ替え（仕様書 24.1）', () => {
  // 6章の棚：全体 400×1800（0枚）、天板 400×1800（1枚）、側板 400×700（2枚）、棚板 379×1760（3枚）
  it('W は仕上がり寸法で比べる。同じ値は今の並び（安定）', () => {
    const job = shelfJob()
    expect(sorted(job, 'W', 'desc')).toEqual(['part-zentai', 'part-tenita', 'part-gawaita', 'part-tanaita'])
    expect(sorted(job, 'W', 'asc')).toEqual(['part-tanaita', 'part-zentai', 'part-tenita', 'part-gawaita'])
  })

  it('H は仕上がり寸法（式の計算結果）で比べる', () => {
    const job = shelfJob()
    expect(sorted(job, 'H', 'desc')).toEqual(['part-zentai', 'part-tenita', 'part-tanaita', 'part-gawaita'])
    expect(sorted(job, 'H', 'asc')).toEqual(['part-gawaita', 'part-tanaita', 'part-zentai', 'part-tenita'])
  })

  it('枚数：0 も値。空（null）は一番下', () => {
    const job = withParts(part('p-a', '帆立', '300', '600', null), part('p-b', '背板', '380', '700', 2))
    expect(sorted(job, 'qty', 'desc')).toEqual(['part-tanaita', 'part-gawaita', 'p-b', 'part-tenita', 'part-zentai', 'p-a'])
    expect(sorted(job, 'qty', 'asc')).toEqual(['part-zentai', 'part-tenita', 'part-gawaita', 'p-b', 'part-tanaita', 'p-a'])
  })

  it('名前：あいうえお順（localeCompare ja）・逆の順。名前の無い部材は一番下', () => {
    const job: Job = {
      ...shelfJob(),
      parts: [
        part('p1', 'たな', '1', '1', 1),
        part('p2', '', '1', '1', 1),
        part('p3', 'あし', '1', '1', 1),
        part('p4', 'かまち', '1', '1', 1),
        part('p5', '', '2', '2', 1),
      ],
    }
    expect(sorted(job, 'name', 'asc')).toEqual(['p3', 'p4', 'p1', 'p2', 'p5'])
    expect(sorted(job, 'name', 'desc')).toEqual(['p1', 'p4', 'p3', 'p2', 'p5'])
    const names = ['たな', 'あし', 'かまち']
    const expected = [...names].sort((a, b) => a.localeCompare(b, 'ja'))
    expect(sorted(job, 'name', 'asc').filter((id) => id !== 'p2' && id !== 'p5')).toEqual(
      expected.map((n) => job.parts.find((p) => p.name === n)!.id),
    )
  })

  it('空・エラーの部材は大きい順・小さい順のどちらでも一番下（その中は今の並び）', () => {
    const job = withParts(
      part('p-err', '', '無い部材.W', '100', 1),
      part('p-empty', '', '', '500', 1),
      part('p-small', '', '50', '50', 1),
    )
    expect(sorted(job, 'W', 'desc')).toEqual(['part-zentai', 'part-tenita', 'part-gawaita', 'part-tanaita', 'p-small', 'p-err', 'p-empty'])
    expect(sorted(job, 'W', 'asc')).toEqual(['p-small', 'part-tanaita', 'part-zentai', 'part-tenita', 'part-gawaita', 'p-err', 'p-empty'])
    // H は p-err・p-empty とも値がある
    expect(sorted(job, 'H', 'asc').slice(0, 3)).toEqual(['p-small', 'p-err', 'p-empty'])
  })

  it('元の配列は書き換えない。中身（寸法・枚数・回転・仕上がり）はそのまま', () => {
    const job = shelfJob()
    const before = ids(job.parts)
    const r = sortParts(job.parts, computeDimensions(job), 'W', 'asc')
    expect(ids(job.parts)).toEqual(before)
    for (const p of r) expect(p).toBe(job.parts.find((q) => q.id === p.id))
  })

  it('並べ替えたあと、名前の無い部材の「#3」は新しい行の番号になる', () => {
    const job: Job = { ...shelfJob(), parts: [part('a', '天板', '900', '400', 1), part('b', '', '300', '200', 1), part('c', '', '600', '200', 1)] }
    const r = sortParts(job.parts, computeDimensions(job), 'W', 'asc')
    expect(partLabels(r).get('b')).toBe('#1')
    expect(partLabels(r).get('c')).toBe('#2')
  })

  it('sameOrder：同じ並びか', () => {
    const job = shelfJob()
    expect(sameOrder(job.parts, [...job.parts])).toBe(true)
    expect(sameOrder(job.parts, sortParts(job.parts, computeDimensions(job), 'W', 'asc'))).toBe(false)
  })
})

describe('行の移動（仕様書 24.2）', () => {
  const ps = ['a', 'b', 'c', 'd', 'e'].map((id) => part(id, id, '1', '1', 1))

  it('1行を下へ・上へ（to は元の並びの行と行の間）', () => {
    expect(ids(moveParts(ps, 1, 1, 4))).toEqual(['a', 'c', 'd', 'b', 'e'])
    expect(ids(moveParts(ps, 3, 1, 0))).toEqual(['d', 'a', 'b', 'c', 'e'])
    expect(ids(moveParts(ps, 0, 1, 5))).toEqual(['b', 'c', 'd', 'e', 'a'])
  })

  it('続いた複数の行をまとめて動かす（中の順はそのまま）', () => {
    expect(ids(moveParts(ps, 1, 2, 5))).toEqual(['a', 'd', 'e', 'b', 'c'])
    expect(ids(moveParts(ps, 3, 2, 1))).toEqual(['a', 'd', 'e', 'b', 'c'])
  })

  it('動かす先が動かす行の中・すぐ上・すぐ下なら変わらない', () => {
    for (const to of [1, 2, 3]) expect(ids(moveParts(ps, 1, 2, to))).toEqual(ids(ps))
  })

  it('部材の無い行は数えない（範囲を収める）', () => {
    expect(ids(moveParts(ps, 3, 4, 0))).toEqual(['d', 'e', 'a', 'b', 'c'])
    expect(ids(moveParts(ps, 1, 1, 9))).toEqual(['a', 'c', 'd', 'e', 'b'])
    expect(ids(moveParts(ps, 7, 1, 0))).toEqual(ids(ps))
  })

  it('movedTop：動かしたあとの一番上の行', () => {
    expect(movedTop(5, 1, 1, 4)).toBe(3)
    expect(movedTop(5, 3, 2, 1)).toBe(1)
    expect(movedTop(5, 1, 2, 5)).toBe(3)
    expect(movedTop(5, 1, 2, 2)).toBe(1)
    expect(movedTop(5, 3, 4, 0)).toBe(0)
  })

  it('元の配列は書き換えない', () => {
    const before = ids(ps)
    moveParts(ps, 0, 2, 5)
    expect(ids(ps)).toEqual(before)
  })
})

describe('名前の中の数字は大きさで比べる', () => {
  it('棚板2 が 棚板10 より前（あいうえお順）', () => {
    const mk = (id: string, name: string) => ({ id, name, expr: { W: '1', H: '1' }, quantity: 1, rotatable: false, finishedDone: false })
    const parts = [mk('a', '棚板10'), mk('b', '棚板2'), mk('c', '棚板1')]
    const dims = { parts: [], errors: [] }
    const out = sortParts(parts, dims as never, 'name', 'asc')
    expect(out.map((p) => p.name)).toEqual(['棚板1', '棚板2', '棚板10'])
  })
})
