// 名前が空の部材・枚数が空の部材（第1.1版 E-10。仕様書 15.1・15.2）
import { describe, expect, it } from 'vitest'
import { duplicatePart } from './clipboard/copy'
import { computeDimensions } from './dimensions'
import { freezeAt, withPart } from './fixtures/progress'
import { shelfJob } from './fixtures/shelf'
import { renamePart } from './formula/rename'
import { validatePartName } from './formula/tokenize'
import { packJob } from './packing'
import { compareStandardSizes } from './packing/sizes'
import { cutQuantity, hasName, partLabel, partLabels, referableParts } from './parts'
import { frozenSheetViews } from './progress/frozen'
import { partCutProgress } from './progress/partProgress'
import { sheetPartChecklist } from './progress/sheetChecklist'
import type { Job, Part } from './types'

const dimsOf = (job: Job) => computeDimensions(job)

function part(id: string, name: string, W: string, H: string, quantity: number | null, rotatable = false): Part {
  return { id, name, expr: { W, H }, quantity, rotatable, finishedDone: false }
}

/** 見本の棚の後ろに部材を足した写し */
function withParts(...parts: Part[]): Job {
  const job = shelfJob()
  return { ...job, parts: [...job.parts, ...parts] }
}

describe('表示用の名前（partLabel）', () => {
  it('名前があれば名前、空なら「#行番号」（job.parts の並びで 1 から）', () => {
    const job = withParts(part('p5', '', '300', '400', 1), part('p6', '扉', '300', '400', 1))
    expect(partLabel(job, 'part-tenita')).toBe('天板')
    expect(partLabel(job, 'p5')).toBe('#5')
    expect(partLabel(job, 'p6')).toBe('扉')
  })

  it('空白だけの名前も空とみなす。無い id は空の文字', () => {
    const job = withParts(part('p5', '  ', '300', '400', 1))
    expect(partLabel(job, 'p5')).toBe('#5')
    expect(partLabel(job, 'nothing')).toBe('')
  })

  it('partLabels は部材の id → 表示用の名前', () => {
    const job = withParts(part('p5', '', '300', '400', 1))
    const m = partLabels(job.parts)
    expect(m.get('part-zentai')).toBe('全体')
    expect(m.get('p5')).toBe('#5')
  })

  it('hasName・referableParts：名前の無い部材は式から参照できない（式のボタンの一覧に出さない）', () => {
    const job = withParts(part('p5', '', '300', '400', 1))
    expect(hasName(job.parts[4])).toBe(false)
    expect(hasName(job.parts[0])).toBe(true)
    expect(referableParts(job.parts).map((p) => p.id)).toEqual(['part-zentai', 'part-tenita', 'part-gawaita', 'part-tanaita'])
  })

  it('cutQuantity：切り出す枚数。null（枚数が空）と 0 は 0', () => {
    expect(cutQuantity(3)).toBe(3)
    expect(cutQuantity(0)).toBe(0)
    expect(cutQuantity(null)).toBe(0)
  })
})

describe('名前が空の部材', () => {
  it('名前が空の部材が2つあっても重なりにならない（validatePartName・renamePart）', () => {
    const job = withParts(part('p5', '', '300', '400', 1), part('p6', '', '300', '400', 1))
    expect(validatePartName('', job.parts.map((p) => p.name))).toBeNull()
    // 名前のある部材を空にできる。空どうしは重ならない
    const r = renamePart(job.parts, 'part-gawaita', '')
    expect(r.ok).toBe(true)
    // 名前のある部材どうしは今までどおり重なり
    expect(validatePartName('天板', job.parts.map((p) => p.name))).toBe('「天板」という部材はすでにあります')
  })

  it('名前が空の部材も寸法を計算し、木取りに入る（配置図の名前は #行番号）', () => {
    const job = withParts(part('p5', '', '300', '400', 2))
    const dims = dimsOf(job)
    const d = dims.parts.find((x) => x.partId === 'p5')!
    expect(d.errors).toEqual([])
    expect(d.finished).toEqual({ W: 300, H: 400 })
    expect(d.name).toBe('#5')
    const r = packJob(job, dims)
    const pls = r.sheets.flatMap((s) => s.placements).filter((p) => p.partId === 'p5')
    expect(pls).toHaveLength(2)
    expect(pls.every((p) => p.name === '#5')).toBe(true)
  })

  it('入らない部材・エラーの部材の知らせも #行番号', () => {
    const job = withParts(part('p5', '', '3000', '400', 1), part('p6', '', '0', '400', 1))
    const r = packJob(job, dimsOf(job))
    expect(r.unplaced).toEqual([{ partId: 'p5', name: '#5', reason: 'tooLarge' }])
    expect(r.skipped).toEqual([{ partId: 'p6', name: '#6', reason: 'dimensionError' }])
  })

  it('切り出しチェック・進み具合・部材が変わっています も #行番号（今の行番号）', () => {
    let job = withParts(part('p5', '', '300', '400', 2))
    const at = packJob(job, dimsOf(job)).sheets.findIndex((s) => s.placements.some((p) => p.partId === 'p5'))
    job = freezeAt(job, at, { partId: 'p5', n: 1 })
    expect(partCutProgress(job).find((r) => r.partId === 'p5')?.name).toBe('#5')
    const rows = sheetPartChecklist(job, job.frozenSheets[0].layout, job.frozenSheets[0].checked)
    expect(rows.find((r) => r.partId === 'p5')?.name).toBe('#5')
    // 上に行を入れると行番号が変わり、今の行番号で出す
    const moved: Job = { ...job, parts: [part('p0', 'X', '100', '100', 0), ...job.parts] }
    expect(partCutProgress(moved).find((r) => r.partId === 'p5')?.name).toBe('#6')
    // 寸法を変える → 部材が変わっています
    const less = withPart(job, 'p5', { expr: { W: '301', H: '400' } })
    const drift = frozenSheetViews(less, dimsOf(less))[0].drift
    expect(drift.find((d) => d.partId === 'p5')?.name).toBe('#5')
  })

  it('複製：名前が空なら空のまま', () => {
    const job = withParts(part('p5', '', '300', '400', 1))
    const r = duplicatePart(job, 'p5', () => 'p-dup')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.job.parts[5]).toMatchObject({ id: 'p-dup', name: '' })
  })
})

describe('枚数が空の部材（quantity: null）', () => {
  it('寸法は計算する', () => {
    const job = withParts(part('p5', '幕板', '400', '100', null))
    expect(dimsOf(job).parts.find((x) => x.partId === 'p5')).toMatchObject({ quantity: null, finished: { W: 400, H: 100 } })
  })

  it('packJob・必要な枚数に入らない（エラーでも入らない知らせに出さない）', () => {
    const base = shelfJob()
    const job = withParts(part('p5', '大板', '1000', '2000', null), part('p6', '', '0', '100', null), part('p7', '', '5000', '100', null))
    const r0 = packJob(base, dimsOf(base))
    const r = packJob(job, dimsOf(job))
    expect(r.sheetCount).toBe(r0.sheetCount)
    expect(r.sheets.flatMap((s) => s.placements).some((p) => ['p5', 'p6', 'p7'].includes(p.partId))).toBe(false)
    expect(r.unplaced).toEqual([])
    expect(r.skipped).toEqual([])
  })

  it('3×6 と 4×8 の比べにも入らない', () => {
    const base = shelfJob()
    const job = withParts(part('p5', '大板', '1000', '2000', null))
    expect(compareStandardSizes(job, dimsOf(job))).toEqual(compareStandardSizes(base, dimsOf(base)))
  })

  it('進み具合に入らない。固定した片がある部材の枚数を空にすると count（部材が変わっています）', () => {
    const job = freezeAt(shelfJob(), 0, { partId: 'part-gawaita', n: 1 })
    const blank = withPart(job, 'part-gawaita', { quantity: null })
    expect(partCutProgress(blank).map((r) => r.name)).toEqual(['天板', '棚板'])
    const drift = frozenSheetViews(blank, dimsOf(blank))[0].drift
    expect(drift.find((d) => d.partId === 'part-gawaita')?.reason).toBe('count')
  })
})
