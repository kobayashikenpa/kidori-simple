// 部材の複製（仕様書 15.1。第1.1版の部材まるごとのコピー・貼り付けのテストは、機能をなくしたので消した）
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { computeDimensions } from '../dimensions'
import { shelfJob } from '../fixtures/shelf'
import type { Job, Part } from '../types'
import { duplicateName, duplicatePart } from './copy'

/** 決まった id を順に出す */
function ids(): (prefix: string) => string {
  let n = 0
  return (prefix) => `${prefix}-new${++n}`
}

function emptyJob(): Job {
  return createJob({ id: 'job-other', name: 'ほかの仕事', now: '2026-10-20T00:00:00.000Z' })
}

function part(id: string, name: string, W = '100', H = '200', quantity = 1): Part {
  return { id, name, expr: { W, H }, quantity, rotatable: false, finishedDone: false }
}

describe('duplicateName（複製の名前）', () => {
  it('棚板 → 棚板のコピー → 棚板のコピー2 → 棚板のコピー3', () => {
    let job = { ...emptyJob(), parts: [part('a', '棚板')] }
    expect(duplicateName(job, '棚板')).toBe('棚板のコピー')
    job = { ...job, parts: [...job.parts, part('b', '棚板のコピー')] }
    expect(duplicateName(job, '棚板')).toBe('棚板のコピー2')
    job = { ...job, parts: [...job.parts, part('c', '棚板のコピー2')] }
    expect(duplicateName(job, '棚板')).toBe('棚板のコピー3')
  })

  it('「棚板のコピー」を複製しても「棚板のコピー2」（のコピーのコピー にしない）', () => {
    const job = { ...emptyJob(), parts: [part('a', '棚板'), part('b', '棚板のコピー')] }
    expect(duplicateName(job, '棚板のコピー')).toBe('棚板のコピー2')
  })

  it('空いている番号を使う。全角・半角の違いも同じ名前とみなす', () => {
    const job = { ...emptyJob(), parts: [part('a', '棚板'), part('b', '棚板のコピー'), part('c', '棚板のコピー３')] }
    expect(duplicateName(job, '棚板')).toBe('棚板のコピー2')
    const job2 = { ...emptyJob(), parts: [part('a', '棚板'), part('b', '棚板のコピー'), part('c', '棚板のコピー２')] }
    expect(duplicateName(job2, '棚板')).toBe('棚板のコピー3')
  })
})

describe('duplicatePart（部材の複製）', () => {
  it('W・H・枚数・回転を写し、名前は「棚板のコピー」、元の部材のすぐ後ろに足す', () => {
    const job = shelfJob()
    job.parts[3].rotatable = true
    job.parts[3].finishedDone = true
    const r = duplicatePart(job, 'part-tanaita', ids())
    if (!r.ok) throw new Error(r.message)
    expect(r.partId).toBe('part-new1')
    expect(r.job.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板', '棚板', '棚板のコピー'])
    expect(r.job.parts[4]).toEqual({
      id: 'part-new1',
      name: '棚板のコピー',
      expr: { W: '379', H: '1760' },
      quantity: 3,
      rotatable: true,
      finishedDone: false,
    })
    expect(job.parts).toHaveLength(4)
  })

  it('途中の部材を複製すると、そのすぐ後ろ。もう1回で「天板のコピー2」', () => {
    const r1 = duplicatePart(shelfJob(), 'part-tenita', ids())
    if (!r1.ok) throw new Error(r1.message)
    const r2 = duplicatePart(r1.job, 'part-tenita', () => 'part-x')
    if (!r2.ok) throw new Error(r2.message)
    expect(r2.job.parts.map((p) => p.name)).toEqual(['全体', '天板', '天板のコピー2', '天板のコピー', '側板', '棚板'])
  })

  it('複製した部材の寸法は元と同じ', () => {
    const r = duplicatePart(shelfJob(), 'part-tanaita', ids())
    if (!r.ok) throw new Error(r.message)
    const d = computeDimensions(r.job)
    expect(d.parts[4].finished).toEqual(d.parts[3].finished)
  })

  it('無い部材は断る', () => {
    expect(duplicatePart(shelfJob(), 'none', ids()).ok).toBe(false)
  })
})
