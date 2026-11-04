// 部材から片を作る（kidori の packing/pieces.test.ts をもとに、材料・木目・フラッシュ・木取り済み（checks.cut）を外し、
// 向きを「回転しない／回転してよい」にしたもの。見本は仕様書 6章の棚（4×8・端切り5・切り代10））
import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../dimensions'
import { shelfJob } from '../fixtures/shelf'
import type { Job, Part } from '../types'
import { expandPieces, orientationsFor, piecesOf, type PieceShape } from './pieces'

function expand(job: Job, frozen?: ReadonlyMap<string, number>) {
  return expandPieces(job, computeDimensions(job), frozen)
}

function addPart(job: Job, p: Partial<Part> & Pick<Part, 'id' | 'name'>) {
  job.parts.push({ expr: { W: '100', H: '100' }, quantity: 1, rotatable: false, finishedDone: false, ...p })
}

/** 4×8 */
const SHIHACHI = { width: 1220, length: 2430 }

/** 片にして、使える範囲に入るかを分ける（4×8・端切り5） */
function pieces(job: Job, mode: 'vertical' | 'horizontal' = 'vertical') {
  return piecesOf(expand(job).runs, SHIHACHI, 5, mode)
}

describe('expandPieces（部材 → 片の並び）', () => {
  it('見本：天板 1・側板 2・棚板 3（部材の並び）。全体（枚数0）は入れず、除いた一覧にも出さない', () => {
    const r = expand(shelfJob())
    expect(r.runs.map((x) => [x.name, x.count])).toEqual([
      ['天板', 1],
      ['側板', 2],
      ['棚板', 3],
    ])
    expect(r.skipped).toEqual([])
  })

  it('片の形は木取り寸法の W・H と回転、寸法の表記は W×H（木取り寸法）', () => {
    const r = expand(shelfJob())
    expect(r.runs.map((x) => [x.shape, x.sizeLabel])).toEqual([
      [{ W: 410, H: 1810, rotatable: false }, '410×1810'],
      [{ W: 410, H: 710, rotatable: false }, '410×710'],
      [{ W: 389, H: 1770, rotatable: false }, '389×1770'],
    ])
  })

  it('小数の寸法の表記は小数第1位まで', () => {
    const job = shelfJob()
    job.parts = [{ ...job.parts[0], expr: { W: '33.33', H: '200.25' }, quantity: 1 }]
    expect(expand(job).runs[0].sizeLabel).toBe('43.3×210.3')
  })

  it('寸法のエラーの部材は dimensionError で除く。枚数0 のエラーの行は理由なしで除く', () => {
    const job = shelfJob()
    addPart(job, { id: 'err', name: 'エラー', expr: { W: '無い.W', H: '100' } })
    addPart(job, { id: 'cyc', name: '循環', expr: { W: '循環.W', H: '100' } })
    addPart(job, { id: 'zero', name: '枚数0のエラー', expr: { W: '無い.W', H: '100' }, quantity: 0 })
    const r = expand(job)
    expect(r.skipped).toEqual([
      { partId: 'err', name: 'エラー', reason: 'dimensionError' },
      { partId: 'cyc', name: '循環', reason: 'dimensionError' },
    ])
    expect(r.runs.map((x) => x.name)).toEqual(['天板', '側板', '棚板'])
  })

  it('片方の軸だけエラーでも除く', () => {
    const job = shelfJob()
    addPart(job, { id: 'half', name: '片方', expr: { W: '100', H: '0' } })
    expect(expand(job).skipped).toEqual([{ partId: 'half', name: '片方', reason: 'dimensionError' }])
  })

  it('固定した1枚の片の数（E-08 で渡す）を、部材の枚数から引く（0 未満にしない）', () => {
    const r = expand(shelfJob(), new Map([['part-gawaita', 1], ['part-tanaita', 5]]))
    expect(r.runs.map((x) => [x.name, x.count])).toEqual([
      ['天板', 1],
      ['側板', 1],
    ])
  })

  it('全部固定した部材は、寸法のエラーがあっても除いた一覧に出さない', () => {
    const job = shelfJob()
    addPart(job, { id: 'err', name: 'エラー', expr: { W: '無い.W', H: '100' }, quantity: 2 })
    expect(expand(job, new Map([['err', 2]])).skipped).toEqual([])
  })

  it('固定した1枚が無ければ（初期値）何も引かない', () => {
    expect(expand(shelfJob())).toEqual(expand(shelfJob(), new Map()))
  })
})

describe('orientationsFor（片の向き）', () => {
  const fit = (shape: PieceShape, mode: 'vertical' | 'horizontal' = 'vertical') => orientationsFor(shape, SHIHACHI, 5, mode)

  it('回転しない：x（妻手方向）＝ W、y（長手方向）＝ H の1つだけ', () => {
    expect(fit({ W: 410, H: 710, rotatable: false })).toEqual([{ x: 410, y: 710, rotated: false }])
  })

  it('回転してよい：W を妻手に置く向きと、回した向きの両方', () => {
    expect(fit({ W: 410, H: 710, rotatable: true })).toEqual([
      { x: 410, y: 710, rotated: false },
      { x: 710, y: 410, rotated: true },
    ])
  })

  it('回転してよい正方形は向きを1つにまとめる', () => {
    expect(fit({ W: 300, H: 300, rotatable: true })).toEqual([{ x: 300, y: 300, rotated: false }])
  })

  it('回転してよい部材で、片方の向きだけ入るなら、その向きだけ残す（W 1510 は妻手 1215 に入らないので回す）', () => {
    expect(fit({ W: 1510, H: 310, rotatable: true })).toEqual([{ x: 310, y: 1510, rotated: true }])
  })

  it('回転しない部材で W が妻手に入らなければ、向きは無い', () => {
    expect(fit({ W: 1510, H: 310, rotatable: false })).toEqual([])
  })

  it('4×8・端切り5：妻手 1215 ぴったりは入り、1216 は入らない', () => {
    expect(fit({ W: 1215, H: 300, rotatable: false })).toHaveLength(1)
    expect(fit({ W: 1216, H: 300, rotatable: false })).toEqual([])
  })

  it('縦切り優先は長手 2430 まで、横切り優先は長手も端切りするので 2425 まで', () => {
    expect(fit({ W: 300, H: 2430, rotatable: false }, 'vertical')).toHaveLength(1)
    expect(fit({ W: 300, H: 2425, rotatable: false }, 'horizontal')).toHaveLength(1)
    expect(fit({ W: 300, H: 2426, rotatable: false }, 'horizontal')).toEqual([])
  })

  it('浮動小数の誤差で入る判定がずれない（1214.9 + 0.1 は 1215 として入る）', () => {
    expect(fit({ W: 1214.9 + 0.1, H: 300, rotatable: false })).toHaveLength(1)
  })
})

describe('piecesOf（片にする・板に収まらない部材）', () => {
  it('見本：片が6枚。id は 部材id#連番、名前は部材名、寸法は木取りの W×H', () => {
    const r = pieces(shelfJob())
    expect(r.pieces.map((p) => p.pieceId)).toEqual([
      'part-tenita#1',
      'part-gawaita#1',
      'part-gawaita#2',
      'part-tanaita#1',
      'part-tanaita#2',
      'part-tanaita#3',
    ])
    expect(r.pieces[1]).toMatchObject({ partId: 'part-gawaita', name: '側板', sizeLabel: '410×710' })
    expect(r.unplaced).toEqual([])
  })

  it('見本はどれも回転しないので、W を妻手方向（x）に置く向きだけ', () => {
    const r = pieces(shelfJob())
    expect(r.pieces[0].orientations).toEqual([{ x: 410, y: 1810, rotated: false }])
  })

  it('板より大きい部材は「板に収まらない部材」（tooLarge。部材ごとに1つ）。ほかの片はそのまま', () => {
    const job = shelfJob()
    addPart(job, { id: 'big', name: '大きい板', expr: { W: '1300', H: '2000' }, quantity: 3 })
    const r = pieces(job)
    expect(r.unplaced).toEqual([{ partId: 'big', name: '大きい板', reason: 'tooLarge' }])
    expect(r.pieces).toHaveLength(6)
  })

  it('回転しない部材は W が妻手に入らなければ入らない。回転してよいなら回して入る', () => {
    const job = shelfJob()
    addPart(job, { id: 'fixed', name: '回転しない', expr: { W: '1500', H: '300' } })
    addPart(job, { id: 'free', name: '回転してよい', expr: { W: '1500', H: '300' }, rotatable: true })
    const r = pieces(job)
    expect(r.unplaced.map((u) => u.partId)).toEqual(['fixed'])
    expect(r.pieces.find((p) => p.partId === 'free')!.orientations).toEqual([{ x: 310, y: 1510, rotated: true }])
  })

  it('切り代を足すと入らない：仕上がり W 1210 は切り代 10 で 1220（入らない）、切り代 5 で 1215（入る）', () => {
    const job = shelfJob()
    addPart(job, { id: 'w', name: '幅いっぱい', expr: { W: '1210', H: '300' } })
    expect(pieces(job).unplaced.map((u) => u.partId)).toEqual(['w'])
    job.settings.allowance = 5
    expect(pieces(job).unplaced).toEqual([])
  })
})
