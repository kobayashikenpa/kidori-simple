// 寸法の計算（第2.2版。仕様書 26.1：W・H は数字だけ）。仕上がり寸法 ＝ 入れた数字、木取り寸法 ＝ 仕上がり ＋ 切り代（W・H に1回ずつ）
import { describe, expect, it } from 'vitest'
import { shelfJob } from '../fixtures/shelf'
import type { Axis, Job, Part } from '../types'
import { computeDimensions } from './index'

function mkPart(name: string, expr: Partial<Record<Axis, string>>, extra: Partial<Part> = {}): Part {
  return { id: `id-${name}`, name, expr: { W: '100', H: '100', ...expr }, quantity: 1, rotatable: false, finishedDone: false, ...extra }
}

function withParts(...extra: Part[]): Job {
  const job = shelfJob()
  job.parts.push(...extra)
  return job
}

const dimsOf = (job: Job, name: string) => computeDimensions(job).parts.find((p) => p.name === name)!

describe('computeDimensions：見本（docs/tasks.md の表。切り代 10）', () => {
  it('仕上がり：全体 400×1800、天板 400×1800、側板 400×700、棚板 379×1760', () => {
    const job = shelfJob()
    expect(dimsOf(job, '全体').finished).toEqual({ W: 400, H: 1800 })
    expect(dimsOf(job, '天板').finished).toEqual({ W: 400, H: 1800 })
    expect(dimsOf(job, '側板').finished).toEqual({ W: 400, H: 700 })
    expect(dimsOf(job, '棚板').finished).toEqual({ W: 379, H: 1760 })
  })

  it('木取り：天板 410×1810、側板 410×710、棚板 389×1770', () => {
    const job = shelfJob()
    expect(dimsOf(job, '天板').cut).toEqual({ W: 410, H: 1810 })
    expect(dimsOf(job, '側板').cut).toEqual({ W: 410, H: 710 })
    expect(dimsOf(job, '棚板').cut).toEqual({ W: 389, H: 1770 })
  })

  it('枚数・名前・id を部材の並び順で返す。見本はエラーなし', () => {
    const job = shelfJob()
    const r = computeDimensions(job)
    expect(r.parts.map((p) => [p.partId, p.name, p.quantity])).toEqual(job.parts.map((p) => [p.id, p.name, p.quantity]))
    expect(r.errors).toEqual([])
  })

  it('枚数0の全体も寸法は出す（切らないかどうかは枚数で決める）', () => {
    const d = dimsOf(shelfJob(), '全体')
    expect(d.quantity).toBe(0)
    expect(d.cut).toEqual({ W: 410, H: 1810 })
  })

  it('名前の無い部材は #行番号。同じ名前の部材が2つあってもそれぞれ計算する（第2.2版。仕様書 26.3）', () => {
    const job = withParts(mkPart('', { W: '300' }), { ...mkPart('棚板', { W: '200' }), id: 'id-棚板2' })
    const r = computeDimensions(job)
    expect(r.parts[4]).toMatchObject({ name: '#5', finished: { W: 300, H: 100 } })
    expect(r.parts.filter((p) => p.name === '棚板').map((p) => p.finished?.W)).toEqual([379, 200])
  })
})

describe('木取り寸法 ＝ 仕上がり ＋ 切り代', () => {
  it('切り代を 5 にすると棚板の木取りは 384×1765（仕上がりは変わらない）', () => {
    const job = shelfJob()
    job.settings.allowance = 5
    expect(dimsOf(job, '棚板').finished).toEqual({ W: 379, H: 1760 })
    expect(dimsOf(job, '棚板').cut).toEqual({ W: 384, H: 1765 })
  })

  it('仕様書 5.1 の例：切り代 10、仕上がり W900×H300 → 木取り W910×H310', () => {
    expect(dimsOf(withParts(mkPart('X', { W: '900', H: '300' })), 'X').cut).toEqual({ W: 910, H: 310 })
  })

  it('切り代 0 なら木取り ＝ 仕上がり。小数の切り代も足す（0.5）', () => {
    const job = shelfJob()
    job.settings.allowance = 0
    expect(dimsOf(job, '棚板').cut).toEqual({ W: 379, H: 1760 })
    job.settings.allowance = 0.5
    expect(dimsOf(job, '棚板').cut).toEqual({ W: 379.5, H: 1760.5 })
  })

  it('小数の寸法（379.5）もそのまま', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '379.5' })), 'X')
    expect(d.finished).toEqual({ W: 379.5, H: 100 })
    expect(d.cut).toEqual({ W: 389.5, H: 110 })
  })
})

describe('エラー（数字でない・0 以下・空）', () => {
  it('0 は nonPositive。木取り寸法も出さない。もう片方の軸は軸ごとの値で出す', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '0', H: '300' })), 'X')
    expect(d.finished).toBeNull()
    expect(d.cut).toBeNull()
    expect(d.errors).toEqual([{ partId: 'id-X', axis: 'W', kind: 'nonPositive', message: '0 より大きい数を入れてください' }])
    expect(d.finishedByAxis).toEqual({ H: 300 })
    expect(d.cutByAxis).toEqual({ H: 310 })
  })

  it('切り代を足せば正になっても、仕上がりが 0 以下なら木取り寸法を出さない', () => {
    expect(dimsOf(withParts(mkPart('X', { W: '0' })), 'X').cut).toBeNull()
  })

  it('空の W は入れている途中の印つきのエラー（数字を入れてください）', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '' })), 'X')
    expect(d.errors[0]).toMatchObject({ kind: 'syntax', message: '数字を入れてください', incomplete: true })
  })

  it('「12.」も入れている途中の印つきのエラー', () => {
    expect(dimsOf(withParts(mkPart('X', { H: '12.' })), 'X').errors[0]).toMatchObject({ axis: 'H', kind: 'syntax', incomplete: true })
  })

  it('式（前の版の書き方）は使えない（syntax・途中の印なし）', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '天板.W - 20' })), 'X')
    expect(d.finished).toBeNull()
    expect(d.errors).toEqual([{ partId: 'id-X', axis: 'W', kind: 'syntax', message: '「天板.W - 20」は使えません（W・H は数字だけです）' }])
  })

  it('0.1 のように小さくても正なら計算する', () => {
    const d = dimsOf(withParts(mkPart('X', { W: '0.1' })), 'X')
    expect(d.errors).toEqual([])
    expect(d.cut?.W).toBeCloseTo(10.1)
  })

  it('全部材のエラーを errors にまとめる（部材の並び順 → W・H の順）', () => {
    const job = withParts(mkPart('X', { W: '0', H: '0' }), mkPart('Y', { H: '' }))
    expect(computeDimensions(job).errors.map((e) => [e.partId, e.axis, e.kind])).toEqual([
      ['id-X', 'W', 'nonPositive'],
      ['id-X', 'H', 'nonPositive'],
      ['id-Y', 'H', 'syntax'],
    ])
  })

  it('ほかの部材の寸法を変えても、別の部材は変わらない（参照は無い）', () => {
    const job = shelfJob()
    job.parts[0].expr.H = '1500'
    expect(dimsOf(job, '天板').finished).toEqual({ W: 400, H: 1800 })
  })
})
