// 仕事1つのファイル（仕様書 15.3。kidori の store/transfer/share.test.ts を参考に、材料・フラッシュ・重ね切り・手持ちを外して作り直したもの）
import { describe, expect, it } from 'vitest'
import { withHistory } from '../fixtures/history'
import { freezeAt } from '../fixtures/progress'
import { MELAMINE_ID, SHEET_ID, shelfAdjusts, shelfJob } from '../fixtures/shelf'
import { buildJobFile, jobFile, jobFileName } from './share'

/** 見本の棚に、切り出しチェックと仕上がりの完了を付けたもの */
function usedShelf() {
  const job = freezeAt(shelfJob(), 0, { partId: 'part-gawaita', n: 1 })
  job.parts = job.parts.map((p) => (p.id === 'part-tenita' ? { ...p, finishedDone: true } : p))
  return job
}

describe('jobFile・buildJobFile', () => {
  it('外側は app: kidori-simple・kind: job・version 1・job・adjusts だけ。空白なしの JSON', () => {
    const text = buildJobFile(shelfJob(), shelfAdjusts())
    const data = JSON.parse(text)
    expect(Object.keys(data).sort()).toEqual(['adjusts', 'app', 'job', 'kind', 'version'])
    expect([data.app, data.kind, data.version]).toEqual(['kidori-simple', 'job', 1])
    expect(text).not.toMatch(/\n/)
  })

  it('調整寸法は、その仕事の式で使っているものだけ（見本はメラミン1 だけ）', () => {
    expect(jobFile(shelfJob(), shelfAdjusts()).adjusts).toEqual([{ id: MELAMINE_ID, name: 'メラミン', value: 1 }])
  })

  it('両方使っていれば両方（アプリの一覧の並び）。使っていない調整寸法・削除した調整寸法は入れない', () => {
    const job = shelfJob()
    job.parts[2].expr.H = `700 - {n:${SHEET_ID}} - {n:gone}`
    const extra = [...shelfAdjusts(), { id: 'adjust-hozo', name: 'ほぞ', value: 15 }]
    expect(jobFile(job, extra).adjusts.map((a) => a.id)).toEqual([MELAMINE_ID, SHEET_ID])
  })

  it('切り出しチェック（固定した1枚）と仕上がりの完了を外す。設定・部材の式・枚数・回転はそのまま', () => {
    const job = usedShelf()
    const f = jobFile(job, shelfAdjusts())
    expect(f.job.frozenSheets).toEqual([])
    expect(f.job.parts.every((p) => !p.finishedDone)).toBe(true)
    expect(f.job.settings).toEqual(job.settings)
    expect(f.job.parts.map((p) => [p.id, p.name, p.expr, p.quantity, p.rotatable])).toEqual(
      job.parts.map((p) => [p.id, p.name, p.expr, p.quantity, p.rotatable]),
    )
    expect(f.job.name).toBe('棚')
  })

  it('履歴は入れない（空の並び。第2.1版。仕様書 25.1）。元の仕事の履歴は残る', () => {
    const job = withHistory(withHistory(usedShelf(), 'h-1', '初めの案'), 'h-2', '扉なし')
    const f = jobFile(job, shelfAdjusts())
    expect(f.job.history).toEqual([])
    expect(buildJobFile(job, shelfAdjusts())).not.toContain('初めの案')
    expect(job.history).toHaveLength(2)
  })

  it('元の仕事は変えない', () => {
    const job = usedShelf()
    const before = JSON.parse(JSON.stringify(job))
    jobFile(job, shelfAdjusts())
    expect(job).toEqual(before)
  })

  it('名前が空・枚数が空の部材もそのまま入る', () => {
    const job = shelfJob()
    job.parts.push({ id: 'p5', name: '', expr: { W: '300', H: '400' }, quantity: null, rotatable: true, finishedDone: true })
    expect(jobFile(job, shelfAdjusts()).job.parts[4]).toEqual({
      id: 'p5',
      name: '',
      expr: { W: '300', H: '400' },
      quantity: null,
      rotatable: true,
      finishedDone: false,
    })
  })
})

describe('jobFileName', () => {
  it('「本棚.kidori-simple.json」', () => {
    expect(jobFileName({ name: '本棚' })).toBe('本棚.kidori-simple.json')
  })

  it('ファイル名に使えない文字（\\ / : * ? " < > |）・空白・制御文字は「_」に置き換える', () => {
    expect(jobFileName({ name: '本棚 A/B:C*?"<>|\\' })).toBe('本棚_A_B_C_______.kidori-simple.json')
    expect(jobFileName({ name: '本棚　2\t' })).toBe('本棚_2.kidori-simple.json')
  })

  it('前後の空白は外す。空なら「仕事.kidori-simple.json」', () => {
    expect(jobFileName({ name: '  本棚  ' })).toBe('本棚.kidori-simple.json')
    expect(jobFileName({ name: '   ' })).toBe('仕事.kidori-simple.json')
    expect(jobFileName({ name: '' })).toBe('仕事.kidori-simple.json')
  })

  it('名前の部分は 50 文字まで', () => {
    expect(jobFileName({ name: 'あ'.repeat(60) })).toBe(`${'あ'.repeat(50)}.kidori-simple.json`)
  })
})
