// 前のデータの式を数字に置き換える（第2.2版。仕様書 26.4）
import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../dimensions'
import { legacyShelfJob, MELAMINE_ID, shelfAdjusts, shelfJob } from '../fixtures/shelf'
import { packJob } from '../packing'
import type { HistoryEntry, Job, Part } from '../types'
import { legacyComputeDimensions } from './legacyDimensions'
import { clipHasFormula, numberingMessage, numberizeJob, numberizeJobs, type NumberingReport } from './numbers'

function part(id: string, name: string, W: string, H: string, quantity: number | null = 1): Part {
  return { id, name, expr: { W, H }, quantity, rotatable: false, finishedDone: false }
}

const sizes = (job: Pick<Job, 'parts'>) => job.parts.map((p) => [p.name, p.expr.W, p.expr.H])

describe('numberizeJob（仕事の W・H の式を仕上がり寸法の数字に）', () => {
  it('見本（6章）の式の仕事：天板 400×1800・側板 400×700・棚板 379×1760 になる（全体も 400×1800 のまま）', () => {
    const { job, report } = numberizeJob(legacyShelfJob(), shelfAdjusts())
    expect(sizes(job)).toEqual([
      ['全体', '400', '1800'],
      ['天板', '400', '1800'],
      ['側板', '400', '700'],
      ['棚板', '379', '1760'],
    ])
    expect(report).toEqual({ replaced: true, cleared: [] })
    // 数字だけの仕事（shelfJob）と同じ部材になる
    expect(job.parts).toEqual(shelfJob().parts)
  })

  it('置き換えたあとの並べ方の結果は、前の計算（式・調整寸法）と同じ（4×8・縦切り優先 2枚・57.2%）', () => {
    const before = legacyShelfJob()
    const old = packJob(before, legacyComputeDimensions(before, shelfAdjusts()))
    const { job } = numberizeJob(before, shelfAdjusts())
    const now = packJob(job, computeDimensions(job))
    expect(now).toEqual(old)
    expect(now.sheetCount).toBe(2)
    expect(Math.round(now.yieldRate * 1000) / 10).toBe(57.2)
  })

  it('横切り優先・切り代 5・3×6 でも並べ方の結果は前と同じ', () => {
    const before = legacyShelfJob()
    before.settings = { ...before.settings, cutMode: 'horizontal', allowance: 5, sheet: { sizeKind: 'saburoku', width: 910, length: 1820 } }
    const old = packJob(before, legacyComputeDimensions(before, shelfAdjusts()))
    const { job } = numberizeJob(before, shelfAdjusts())
    expect(packJob(job, computeDimensions(job))).toEqual(old)
  })

  it('調整寸法は、そのデータの中の一覧で計算する（メラミン2 なら棚板 W は 378）', () => {
    const adjusts = shelfAdjusts().map((a) => (a.id === MELAMINE_ID ? { ...a, value: 2 } : a))
    expect(numberizeJob(legacyShelfJob(), adjusts).job.parts[3].expr.W).toBe('378')
  })

  it('書きかけの調整寸法（寸法が空）は使えない＝削除した調整寸法と同じくエラーで空にする', () => {
    const adjusts = [{ id: MELAMINE_ID, name: 'メラミン', value: null }]
    const { job, report } = numberizeJob(legacyShelfJob(), adjusts)
    expect(job.parts[3].expr).toEqual({ W: '', H: '1760' })
    expect(report.cleared).toEqual([{ jobId: 'job-shelf', jobName: '棚', partName: '棚板', axis: 'W' }])
  })

  it('値は小数第1位に丸める（1000 / 3 → 333.3）', () => {
    const job = { ...shelfJob(), parts: [part('a', 'A', '1000 / 3', '0.1 + 0.2')] }
    expect(numberizeJob(job, []).job.parts[0].expr).toEqual({ W: '333.3', H: '0.3' })
  })

  it('エラーの式は空にして、仕事名・部材名（空なら #行番号）・W/H を返す。参照先のエラーで計算できない式も空にする', () => {
    const job: Job = {
      ...shelfJob('j1', '本棚'),
      parts: [
        part('a', '天板', '600', '地板.H'),
        part('b', '', '天板.H - 20', '0'),
        part('c', '扉', '1 / 0', '1800 - 2000'),
        part('d', '棚', '300 +', '{n:gone}'),
      ],
    }
    const { job: out, report } = numberizeJob(job, shelfAdjusts())
    expect(sizes(out)).toEqual([
      ['天板', '600', ''],
      ['', '', '0'],
      ['扉', '', ''],
      ['棚', '', ''],
    ])
    expect(report.replaced).toBe(true)
    expect(report.cleared.map((c) => [c.jobName, c.partName, c.axis])).toEqual([
      ['本棚', '天板', 'H'],
      ['本棚', '#2', 'W'],
      ['本棚', '扉', 'W'],
      ['本棚', '扉', 'H'],
      ['本棚', '棚', 'W'],
      ['本棚', '棚', 'H'],
    ])
  })

  it('数字だけ・空の W・H はそのまま（0 も数字なので空にしない。一覧にも入れない）', () => {
    const job = { ...shelfJob(), parts: [part('a', 'A', '400', ''), part('b', 'B', '0', '12.5')] }
    const r = numberizeJob(job, [])
    expect(r.job).toBe(job)
    expect(r.report).toEqual({ replaced: false, cleared: [] })
  })

  it('先頭に「＝」の付いた式・全角の数字も数字にする', () => {
    const job = { ...shelfJob(), parts: [part('a', 'A', '＝400', '１８００')] }
    const r = numberizeJob(job, [])
    expect(r.job.parts[0].expr).toEqual({ W: '400', H: '1800' })
    expect(r.report.replaced).toBe(true)
  })

  it('名前・枚数・回転・仕上がりのチェック・id・固定した1枚はそのまま', () => {
    const before = legacyShelfJob()
    before.parts[2] = { ...before.parts[2], rotatable: true, finishedDone: true, quantity: null }
    const { job } = numberizeJob(before, shelfAdjusts())
    expect(job.parts.map(({ expr: _e, ...rest }) => rest)).toEqual(before.parts.map(({ expr: _e, ...rest }) => rest))
    expect(job.frozenSheets).toBe(before.frozenSheets)
    expect(job.settings).toEqual(before.settings)
    expect(job.updatedAt).toBe(before.updatedAt)
  })

  it('元の仕事は書き換えない', () => {
    const before = legacyShelfJob()
    const copy = JSON.parse(JSON.stringify(before))
    numberizeJob(before, shelfAdjusts())
    expect(before).toEqual(copy)
  })
})

describe('履歴の中の部材も置き換える（仕様書 26.4）', () => {
  const entry = (id: string, memo: string, parts: HistoryEntry['parts']): HistoryEntry => ({
    id,
    savedAt: '2026-11-04T09:00:00.000Z',
    memo,
    settings: { ...shelfJob().settings, allowance: 5 },
    parts,
    sheetCount: 2,
    yieldRate: 0.5,
  })

  it('履歴の部材の式を、履歴の中の部材どうしで計算した数字にする。エラーは空にして履歴の印つきで返す', () => {
    const job: Job = {
      ...shelfJob('j1', '本棚'),
      history: [
        entry('h-2', '幅を広げた', [
          { name: '天板', expr: { W: '500', H: '1800' }, quantity: 1, rotatable: false, finishedDone: false },
          { name: '棚板', expr: { W: `天板.W - 20 - {n:${MELAMINE_ID}}`, H: '側板.H' }, quantity: 2, rotatable: true, finishedDone: true },
        ]),
        entry('h-1', '', legacyShelfJob().parts.map(({ id: _id, ...p }) => p)),
      ],
    }
    const { job: out, report } = numberizeJob(job, shelfAdjusts())
    expect(out.history[0].parts.map((p) => [p.name, p.expr.W, p.expr.H])).toEqual([
      ['天板', '500', '1800'],
      ['棚板', '479', ''],
    ])
    expect(out.history[0].parts[1]).toMatchObject({ quantity: 2, rotatable: true, finishedDone: true })
    expect(out.history[1].parts).toEqual(shelfJob().parts.map(({ id: _id, ...p }) => p))
    // 履歴の id・メモ・設定・枚数・歩留まりはそのまま
    expect(out.history.map(({ parts: _p, ...rest }) => rest)).toEqual(job.history.map(({ parts: _p, ...rest }) => rest))
    expect(report.cleared).toEqual([
      { jobId: 'j1', jobName: '本棚', partName: '棚板', axis: 'H', history: { id: 'h-2', savedAt: '2026-11-04T09:00:00.000Z', memo: '幅を広げた' } },
    ])
  })

  it('履歴だけに式があっても replaced になる。今の部材は同じ配列のまま', () => {
    const base = shelfJob()
    const job: Job = { ...base, history: [entry('h', '', [{ name: 'A', expr: { W: '100 * 2', H: '300' }, quantity: 1, rotatable: false, finishedDone: false }])] }
    const r = numberizeJob(job, [])
    expect(r.report.replaced).toBe(true)
    expect(r.job.parts).toBe(base.parts)
    expect(r.job.history[0].parts[0].expr).toEqual({ W: '200', H: '300' })
  })
})

describe('numberizeJobs（全部の仕事）', () => {
  it('仕事の並びのまま置き換え、エラーで空にしたものを仕事の並びでまとめる', () => {
    const bad = { ...shelfJob('j2', '台'), parts: [part('x', '脚', '天板.W', '700')] }
    const { jobs, report } = numberizeJobs([legacyShelfJob('j1', '棚'), bad, shelfJob('j3', '数字だけ')], shelfAdjusts())
    expect(jobs.map((j) => j.id)).toEqual(['j1', 'j2', 'j3'])
    expect(jobs[0].parts[3].expr).toEqual({ W: '379', H: '1760' })
    expect(report).toEqual({ replaced: true, cleared: [{ jobId: 'j2', jobName: '台', partName: '脚', axis: 'W' }] })
  })

  it('式が1つも無ければ replaced は false', () => {
    expect(numberizeJobs([shelfJob()], []).report).toEqual({ replaced: false, cleared: [] })
  })
})

describe('clipHasFormula（アプリの中でコピーしたセルに式が入っているか）', () => {
  it('部材の寸法・調整寸法・計算の記号が入ったセルがあれば true', () => {
    expect(clipHasFormula({ rows: 1, cols: 1, cells: [['天板.W - 20']] })).toBe(true)
    expect(clipHasFormula({ rows: 1, cols: 2, cells: [['棚板', `{n:${MELAMINE_ID}}`]] })).toBe(true)
    expect(clipHasFormula({ rows: 1, cols: 1, cells: [['1800 - 40']] })).toBe(true)
  })
  it('名前・数字・空だけなら false', () => {
    expect(clipHasFormula({ rows: 2, cols: 4, cells: [['棚板', '379', '1760', '3'], ['', '400.5', '', '']] })).toBe(false)
  })
})

describe('numberingMessage（1度だけ出す知らせの文）', () => {
  it('置き換えていなければ null', () => {
    expect(numberingMessage({ replaced: false, cleared: [] })).toBeNull()
  })
  it('エラーで空にしたものが無ければ「式を数字に置き換えました」', () => {
    expect(numberingMessage({ replaced: true, cleared: [] })).toBe('式を数字に置き換えました')
  })
  it('あれば件数と「仕事名・部材名 W」を並べる。履歴の中のものは（履歴）を付ける', () => {
    const report: NumberingReport = {
      replaced: true,
      cleared: [
        { jobId: 'j1', jobName: '本棚', partName: '棚板', axis: 'W' },
        { jobId: 'j1', jobName: '本棚', partName: '#2', axis: 'H', history: { id: 'h', savedAt: 't', memo: '' } },
      ],
    }
    expect(numberingMessage(report)).toBe('式を数字に置き換えました（エラーで空にしたもの 2件：本棚・棚板 W、本棚・#2 H（履歴））')
  })
})
