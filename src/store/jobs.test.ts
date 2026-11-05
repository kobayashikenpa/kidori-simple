import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../engine/defaults'
import { withHistory } from '../engine/fixtures/history'
import { freezeAt } from '../engine/fixtures/progress'
import { shelfJob } from '../engine/fixtures/shelf'
import type { Job } from '../engine/types'
import {
  addPart,
  copyJob,
  insertPart,
  defaultJobName,
  deleteJob,
  makeJob,
  newPart,
  removePart,
  renameJob,
  setAllRotatable,
  setSheet,
  updatePart,
  updateSettings,
} from './jobs'

const NOW = new Date(2026, 9, 21, 9, 0, 0)

function okJob(r: { ok: true; job: Job } | { ok: false; message: string }): Job {
  if (!r.ok) throw new Error(r.message)
  return r.job
}

function counter() {
  let n = 0
  return (prefix: string) => `${prefix}-${++n}`
}

describe('仕事', () => {
  it('新しい仕事の名前の初期値は「10/21 」の形（月/日 と半角スペース。仕様書 22）', () => {
    expect(defaultJobName(NOW)).toBe('10/21 ')
    expect(defaultJobName(new Date(2026, 0, 5))).toBe('1/5 ')
  })

  it('新しい仕事は初期値の設定・部材なし。名前が空なら日付だけの名前（後ろの空白は取る）', () => {
    const job = makeJob('  ', NOW, 'job-1')
    expect(job.name).toBe('10/21')
    expect(job.settings).toEqual(defaultSettings())
    // 切り代の初期値は 0（第2.3版。仕様書 27.6）
    expect(job.settings.allowance).toBe(0)
    expect(job.parts).toEqual([])
    expect(job.createdAt).toBe(NOW.toISOString())
    expect(makeJob(' 食器棚 ', NOW, 'job-2').name).toBe('食器棚')
  })

  it('名前を変える。空は断る', () => {
    const job = shelfJob()
    expect(okJob(renameJob(job, ' 本棚 ')).name).toBe('本棚')
    expect(renameJob(job, ' ').ok).toBe(false)
  })

  it('コピーは設定を引き継ぎ、名前は「◯◯のコピー」。部材はそのまま写し id は新しい', () => {
    const src = okJob(updateSettings(shelfJob(), { kerf: 4, allowance: 5, cutMode: 'horizontal' }))
    const withSheet = okJob(setSheet(src, { sizeKind: 'saburoku', width: 0, length: 0 }))
    const c = copyJob(withSheet, NOW, 'job-copy', counter())
    expect(c.id).toBe('job-copy')
    expect(c.name).toBe('棚のコピー')
    expect(c.settings).toEqual(withSheet.settings)
    expect(c.settings).not.toBe(withSheet.settings)
    expect(c.settings.sheet).not.toBe(withSheet.settings.sheet)
    expect(c.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板', '棚板'])
    expect(c.parts[3].expr).toEqual({ W: '379', H: '1760' })
    expect(c.parts.map((p) => p.id)).toEqual(['part-1', 'part-2', 'part-3', 'part-4'])
    expect(c.frozenSheets).toEqual([])
    expect(c.createdAt).toBe(NOW.toISOString())
  })

  it('コピーは履歴もコピーする（第2.1版。仕様書 25.1）。深い写しなので、コピーの履歴を変えても元は変わらない', () => {
    const src = withHistory(withHistory(freezeAt(shelfJob(), 0, { partId: 'part-gawaita', n: 1 }), 'h-1', '初めの案'), 'h-2', '扉なし')
    const c = copyJob(src, NOW, 'job-copy', counter())
    expect(c.history).toEqual(src.history)
    expect(c.history).not.toBe(src.history)
    c.history[0].parts[0].expr.W = '1'
    c.history[0].settings.sheet.width = 1
    expect(src.history[0].parts[0].expr.W).toBe('400')
    expect(src.history[0].settings.sheet.width).toBe(1220)
    // 切った記録は今までどおり写さない
    expect(c.frozenSheets).toEqual([])
  })

  it('削除。開いていた仕事なら開いていない状態にする', () => {
    const jobs = [shelfJob('a'), shelfJob('b')]
    expect(deleteJob(jobs, 'a', 'a')).toEqual({ jobs: [jobs[1]], currentJobId: null })
    expect(deleteJob(jobs, 'b', 'a')).toEqual({ jobs: [jobs[1]], currentJobId: 'b' })
  })
})

describe('設定', () => {
  it('刃厚・端切り・切り代は 0 以上', () => {
    const job = shelfJob()
    expect(okJob(updateSettings(job, { kerf: 0 })).settings.kerf).toBe(0)
    expect(updateSettings(job, { trim: -1 }).ok).toBe(false)
    expect(updateSettings(job, { allowance: Number.NaN }).ok).toBe(false)
  })

  it('板のサイズ：3×6 は決まった大きさ、自由入力は小さいほうを妻手にそろえる', () => {
    const job = shelfJob()
    expect(okJob(setSheet(job, { sizeKind: 'saburoku', width: 1, length: 1 })).settings.sheet).toEqual({
      sizeKind: 'saburoku',
      width: 910,
      length: 1820,
    })
    expect(okJob(setSheet(job, { sizeKind: 'custom', width: 2000, length: 1000 })).settings.sheet).toEqual({
      sizeKind: 'custom',
      width: 1000,
      length: 2000,
    })
    expect(setSheet(job, { sizeKind: 'custom', width: 0, length: 1000 }).ok).toBe(false)
  })
})

describe('部材', () => {
  it('足す・変える・消す', () => {
    let job = makeJob('x', NOW, 'job')
    job = okJob(addPart(job, newPart('p1', { name: '天板', expr: { W: '400', H: '1800' } })))
    job = okJob(addPart(job, newPart('p2', { name: '棚板', expr: { W: '380', H: '300' }, quantity: 3 })))
    expect(job.parts.map((p) => p.name)).toEqual(['天板', '棚板'])
    job = okJob(updatePart(job, 'p2', { quantity: 4, rotatable: true }))
    expect(job.parts[1]).toMatchObject({ quantity: 4, rotatable: true, expr: { W: '380', H: '300' } })
    job = okJob(removePart(job, 'p1'))
    expect(job.parts.map((p) => p.id)).toEqual(['p2'])
    expect(removePart(job, 'p1').ok).toBe(false)
  })

  it('同じ名前の部材を足せる・同じ名前に変えられる（第2.2版。仕様書 26.3）', () => {
    let job = makeJob('x', NOW, 'job')
    job = okJob(addPart(job, newPart('p1', { name: '棚板' })))
    job = okJob(addPart(job, newPart('p2', { name: '棚板' })))
    job = okJob(addPart(job, newPart('p3', { name: '側板' })))
    job = okJob(updatePart(job, 'p3', { name: '棚板' }))
    expect(job.parts.map((p) => [p.id, p.name])).toEqual([
      ['p1', '棚板'],
      ['p2', '棚板'],
      ['p3', '棚板'],
    ])
  })

  it('名前の前後の空白は外す。式の記号（+ - × ÷ ( ) . { }）・途中の空白も名前に使える（第2.2版。式で参照しなくなったため。暫定）', () => {
    let job = makeJob('x', NOW, 'job')
    job = okJob(addPart(job, newPart('p1', { name: ' 棚板(左) ' })))
    job = okJob(addPart(job, newPart('p2', { name: '扉 W×H.上' })))
    expect(job.parts.map((p) => p.name)).toEqual(['棚板(左)', '扉 W×H.上'])
  })

  it('名前を変えても、ほかの部材は変わらない（式の書き換えはない。第2.2版）', () => {
    const before = shelfJob()
    const job = okJob(updatePart(before, 'part-tenita', { name: '天板A' }))
    expect(job.parts[1].name).toBe('天板A')
    expect(job.parts.filter((p) => p.id !== 'part-tenita')).toEqual(before.parts.filter((p) => p.id !== 'part-tenita'))
  })

  it('枚数は 0 以上の整数', () => {
    const job = makeJob('x', NOW, 'job')
    expect(addPart(job, newPart('p', { name: 'a', quantity: -1 })).ok).toBe(false)
    expect(addPart(job, newPart('p', { name: 'a', quantity: 1.5 })).ok).toBe(false)
    expect(addPart(job, newPart('p', { name: 'a', quantity: 0 })).ok).toBe(true)
  })

  it('名前が空の部材は2つ以上足せる（空どうしは重ならない）。名前を空に変えられる（第1.1版）', () => {
    let job = makeJob('x', NOW, 'job')
    job = okJob(addPart(job, newPart('p1', { name: '', expr: { W: '100', H: '200' } })))
    job = okJob(addPart(job, newPart('p2', { name: '  ', expr: { W: '100', H: '200' } })))
    job = okJob(addPart(job, newPart('p3', { name: '天板' })))
    expect(job.parts.map((p) => p.name)).toEqual(['', '', '天板'])
    job = okJob(updatePart(job, 'p3', { name: '' }))
    expect(job.parts[2].name).toBe('')
    job = okJob(updatePart(job, 'p1', { name: '側板' }))
    expect(okJob(updatePart(job, 'p2', { name: '側板' })).parts.map((p) => p.name)).toEqual(['側板', '側板', ''])
  })

  it('枚数は空（null）にできる（第1.1版）', () => {
    let job = makeJob('x', NOW, 'job')
    job = okJob(addPart(job, newPart('p1', { name: 'a', quantity: null })))
    expect(job.parts[0].quantity).toBeNull()
    job = okJob(updatePart(job, 'p1', { quantity: 2 }))
    job = okJob(updatePart(job, 'p1', { quantity: null }))
    expect(job.parts[0].quantity).toBeNull()
  })

  it('仕事のコピーは、名前が空・枚数が空の部材もそのまま写す', () => {
    let job = makeJob('x', NOW, 'job')
    job = okJob(addPart(job, newPart('p1', { name: '', quantity: null })))
    const c = copyJob(job, NOW, 'job2', counter())
    expect(c.parts[0]).toMatchObject({ name: '', quantity: null })
  })

  it('上に行を入れる：指定した位置に足す（範囲外は最後）。同じ名前でも足せる（第2.2版）', () => {
    let job = shelfJob()
    job = okJob(insertPart(job, 1, newPart('n1', { name: '', quantity: null })))
    expect(job.parts.map((p) => p.id)).toEqual(['part-zentai', 'n1', 'part-tenita', 'part-gawaita', 'part-tanaita'])
    job = okJob(insertPart(job, 99, newPart('n2', { name: '地板' })))
    expect(job.parts.at(-1)?.id).toBe('n2')
    expect(okJob(insertPart(job, 0, newPart('n3', { name: '天板' }))).parts.filter((p) => p.name === '天板')).toHaveLength(2)
    expect(insertPart(job, 0, newPart('n2', { name: 'x' }))).toEqual({ ok: false, message: '同じ id の部材があります' })
  })

  it('全部回転してよい／全部回転しない。変わらなければ同じ仕事を返す', () => {
    const job = okJob(setAllRotatable(shelfJob(), true))
    expect(job.parts.every((p) => p.rotatable)).toBe(true)
    expect(okJob(setAllRotatable(job, true))).toBe(job)
    expect(okJob(setAllRotatable(job, false)).parts.every((p) => !p.rotatable)).toBe(true)
  })

})
