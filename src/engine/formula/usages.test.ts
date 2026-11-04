import { describe, expect, it } from 'vitest'
import { MELAMINE_ID, SHEET_ID, legacyShelfJob as shelfJob } from '../fixtures/shelf'
import { adjustIdsInExpr, adjustUsages, adjustUsagesOf, partsUsingAdjust, partsUsingAdjusts, remapAdjustIds } from './usages'

describe('adjustIdsInExpr（式に出てくる調整寸法の id）', () => {
  it('出てきた順に、同じものも出てきた回数だけ', () => {
    expect(adjustIdsInExpr('{n:a} + 天板.W - {n:b} + {n:a}')).toEqual(['a', 'b', 'a'])
  })

  it('読めない式の中でも見つける。全角の ｛ ｝ も', () => {
    expect(adjustIdsInExpr('1800 - ｛n:a｝ @')).toEqual(['a'])
  })

  it('kidori の {t:…}・閉じていない { は数えない', () => {
    expect(adjustIdsInExpr('{t:a} + {n:b')).toEqual([])
  })
})

describe('partsUsingAdjust（1つの仕事で、調整寸法を式で使っている部材）', () => {
  it('見本のメラミン1 は［棚板（W）］', () => {
    expect(partsUsingAdjust(shelfJob(), MELAMINE_ID)).toEqual(['棚板（W）'])
  })

  it('見本のシート0.5 は使われていない', () => {
    expect(partsUsingAdjust(shelfJob(), SHEET_ID)).toEqual([])
  })

  it('1つの部材で W・H の両方に使っていれば軸を並べる（部材の並び順）', () => {
    const job = shelfJob()
    job.parts[2].expr.H = `700 - {n:${MELAMINE_ID}}`
    job.parts[3].expr.H = `天板.H - 20 × 2 - {n:${MELAMINE_ID}}`
    expect(partsUsingAdjust(job, MELAMINE_ID)).toEqual(['側板（H）', '棚板（W・H）'])
  })

  it('読めない式の中でも見つける', () => {
    const job = shelfJob()
    job.parts[0].expr.H = `1800 - {n:${MELAMINE_ID}} @`
    expect(partsUsingAdjust(job, MELAMINE_ID)).toEqual(['全体（H）', '棚板（W）'])
  })
})

describe('partsUsingAdjusts（いくつかの調整寸法のどれかを使っている部材）', () => {
  it('部材ごとに1つ、軸はまとめる', () => {
    const job = shelfJob()
    job.parts[3].expr.H = `天板.H - {n:${SHEET_ID}}`
    expect(partsUsingAdjusts(job, [MELAMINE_ID, SHEET_ID])).toEqual(['棚板（W・H）'])
  })

  it('1つの軸で2つ使っていても軸は1回', () => {
    const job = shelfJob()
    job.parts[3].expr.W = `天板.W - {n:${MELAMINE_ID}} - {n:${SHEET_ID}}`
    expect(partsUsingAdjusts(job, [MELAMINE_ID, SHEET_ID])).toEqual(['棚板（W）'])
  })

  it('id が1つなら partsUsingAdjust と同じ。空なら空', () => {
    expect(partsUsingAdjusts(shelfJob(), [MELAMINE_ID])).toEqual(partsUsingAdjust(shelfJob(), MELAMINE_ID))
    expect(partsUsingAdjusts(shelfJob(), [])).toEqual([])
  })
})

describe('adjustUsages（全部の仕事から、調整寸法を使っている部材を探す）', () => {
  it('2つの仕事で使っている調整寸法は、両方の仕事の部材が返る（仕事の並び順・部材の並び順）', () => {
    const a = shelfJob('job-a', '棚A')
    const b = shelfJob('job-b', '棚B')
    b.parts[2].expr.H = `700 - {n:${MELAMINE_ID}}`
    expect(adjustUsages({ jobs: [a, b] }, MELAMINE_ID)).toEqual([
      { jobId: 'job-a', jobName: '棚A', partId: 'part-tanaita', partName: '棚板', axes: ['W'] },
      { jobId: 'job-b', jobName: '棚B', partId: 'part-gawaita', partName: '側板', axes: ['H'] },
      { jobId: 'job-b', jobName: '棚B', partId: 'part-tanaita', partName: '棚板', axes: ['W'] },
    ])
  })

  it('使っていない仕事は入らない。どこにも無ければ空', () => {
    const a = shelfJob('job-a', '棚A')
    const b = shelfJob('job-b', '棚B')
    b.parts[3].expr.W = '天板.W - 20'
    expect(adjustUsages({ jobs: [a, b] }, MELAMINE_ID).map((u) => u.jobId)).toEqual(['job-a'])
    expect(adjustUsages({ jobs: [a, b] }, SHEET_ID)).toEqual([])
    expect(adjustUsages({ jobs: [] }, MELAMINE_ID)).toEqual([])
  })

  it('W・H の両方で使っていれば axes は W・H の順', () => {
    const a = shelfJob('job-a', '棚A')
    a.parts[3].expr.H = `{n:${MELAMINE_ID}} + 天板.H`
    expect(adjustUsages({ jobs: [a] }, MELAMINE_ID)[0].axes).toEqual(['W', 'H'])
  })
})

describe('adjustUsagesOf（いくつかの調整寸法をまとめて調べる。一括削除の確認用）', () => {
  it('部材ごとに1つ、軸はまとめ、どの調整寸法を使っているかも返す', () => {
    const a = shelfJob('job-a', '棚A')
    a.parts[3].expr.H = `天板.H - {n:${SHEET_ID}}`
    const b = shelfJob('job-b', '棚B')
    expect(adjustUsagesOf({ jobs: [a, b] }, [MELAMINE_ID, SHEET_ID])).toEqual([
      { jobId: 'job-a', jobName: '棚A', partId: 'part-tanaita', partName: '棚板', axes: ['W', 'H'], adjustIds: [MELAMINE_ID, SHEET_ID] },
      { jobId: 'job-b', jobName: '棚B', partId: 'part-tanaita', partName: '棚板', axes: ['W'], adjustIds: [MELAMINE_ID] },
    ])
  })

  it('調べる id が空なら空', () => {
    expect(adjustUsagesOf({ jobs: [shelfJob()] }, [])).toEqual([])
  })

  it('使っている仕事の数は jobId の重なりを除いて数える（「◯件の仕事で使っています」用）', () => {
    const jobs = [shelfJob('job-a', '棚A'), shelfJob('job-b', '棚B'), shelfJob('job-c', '棚C')]
    jobs[2].parts[3].expr.W = '379'
    const ids = new Set(adjustUsagesOf({ jobs }, [MELAMINE_ID]).map((u) => u.jobId))
    expect(ids.size).toBe(2)
  })
})

describe('remapAdjustIds（式の調整寸法の id のつけ替え。共有・バックアップの取り込み用）', () => {
  it('表にある id だけつけ替え、ほかの部分はそのまま', () => {
    const map = new Map([['a', 'x'], ['b', 'y']])
    expect(remapAdjustIds('天板.W - {n:a} + {n:c} - {n:b} - {n:a}', map)).toBe('天板.W - {n:x} + {n:c} - {n:y} - {n:x}')
  })

  it('読めない式の中・全角の ｛ ｝ もつけ替える。部材の参照は変えない', () => {
    expect(remapAdjustIds('a.W + ｛n:a｝ @', new Map([['a', 'x']]))).toBe('a.W + {n:x} @')
  })
})
