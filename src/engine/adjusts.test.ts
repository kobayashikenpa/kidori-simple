// 調整寸法の表の行（書きかけを含む）と、式で使える調整寸法（第1.7版。仕様書 21.1・21.3）
import { describe, expect, it } from 'vitest'
import { MELAMINE_ID, SHEET_ID, shelfAdjusts, legacyShelfJob as shelfJob } from './fixtures/shelf'
import { legacyComputeDimensions } from './migrate/legacyDimensions'
import { formulaText } from './formula/display'
import {
  adjustChangeUsages,
  adjustConflict,
  adjustValueText,
  changedAdjusts,
  isBlankAdjustRow,
  isUsableAdjust,
  parseAdjustValue,
  usableAdjusts,
} from './adjusts'
import type { AdjustRow, Job } from './types'

const row = (id: string, name: string, value: number | null): AdjustRow => ({ id, name, value })

describe('isUsableAdjust・usableAdjusts（式で使える行）', () => {
  it('名前と寸法がそろって、寸法が 0 より大きい行だけ', () => {
    expect(isUsableAdjust(row('a', 'メラミン', 1))).toBe(true)
    expect(isUsableAdjust(row('a', 'メラミン', null))).toBe(false)
    expect(isUsableAdjust(row('a', '', 1))).toBe(false)
    expect(isUsableAdjust(row('a', '  ', 1))).toBe(false)
    expect(isUsableAdjust(row('a', 'メラミン', 0))).toBe(false)
  })

  it('表の並びのまま、書きかけを外す', () => {
    const rows = [row('a', 'メラミン', 1), row('b', 'ほぞ', null), row('c', '', 15), row('d', 'シート', 0.5)]
    expect(usableAdjusts(rows).map((a) => a.id)).toEqual(['a', 'd'])
  })

  it('同じ一覧を渡せば同じ配列を返す（画面の useMemo が毎回動かないように）', () => {
    const rows = [row('a', 'メラミン', 1)]
    expect(usableAdjusts(rows)).toBe(usableAdjusts(rows))
  })
})

describe('isBlankAdjustRow（名前も寸法も空の行）', () => {
  it('名前が空白だけで寸法が空なら空の行', () => {
    expect(isBlankAdjustRow(row('a', ' ', null))).toBe(true)
    expect(isBlankAdjustRow(row('a', 'ほぞ', null))).toBe(false)
    expect(isBlankAdjustRow(row('a', '', 1))).toBe(false)
  })
})

describe('parseAdjustValue・adjustValueText（寸法の欄の文字）', () => {
  it('0 より大きい数（全角・小数も）', () => {
    expect(parseAdjustValue('1')).toBe(1)
    expect(parseAdjustValue('０．５')).toBe(0.5)
    expect(parseAdjustValue(' 12 ')).toBe(12)
    expect(parseAdjustValue('.5')).toBe(0.5)
  })

  it('空は null（寸法を空に）', () => {
    expect(parseAdjustValue('')).toBeNull()
    expect(parseAdjustValue('  ')).toBeNull()
  })

  it('0・負の数・式・文字は入れられない（undefined）', () => {
    expect(parseAdjustValue('0')).toBeUndefined()
    expect(parseAdjustValue('0.0')).toBeUndefined()
    expect(parseAdjustValue('-1')).toBeUndefined()
    expect(parseAdjustValue('1+1')).toBeUndefined()
    expect(parseAdjustValue('天板.W')).toBeUndefined()
    expect(parseAdjustValue('メラミン')).toBeUndefined()
    expect(parseAdjustValue('1.2.3')).toBeUndefined()
  })

  it('文字にするときは丸めず、空は空', () => {
    expect(adjustValueText(0.25)).toBe('0.25')
    expect(adjustValueText(0.1 + 0.2)).toBe('0.3')
    expect(adjustValueText(null)).toBe('')
  })
})

describe('adjustConflict（表示名が同じになる行）', () => {
  const rows = [row('a', 'メラミン', 1), row('b', '逃げ', 15), row('c', 'ほぞ', null)]

  it('表示名（名前＋寸法）が同じ行を返す', () => {
    expect(adjustConflict(rows, { name: 'メラミン', value: 1 })?.id).toBe('a')
    expect(adjustConflict(rows, { name: 'メラミン', value: 2 })).toBeNull()
  })

  it('名前「逃げ1」寸法5 は「逃げ15」と重なる', () => {
    expect(adjustConflict(rows, { name: '逃げ1', value: 5 })?.id).toBe('b')
  })

  it('自分自身・書きかけの行・書きかけの入力は重ならない', () => {
    expect(adjustConflict(rows, { name: 'メラミン', value: 1 }, 'a')).toBeNull()
    expect(adjustConflict(rows, { name: 'ほぞ', value: null })).toBeNull()
    expect(adjustConflict(rows, { name: '', value: 1 })).toBeNull()
  })
})

describe('書きかけの行を使っている式', () => {
  it('寸法を空にした調整寸法を使う式は「削除した調整寸法」と同じエラー・表示', () => {
    const rows: AdjustRow[] = shelfAdjusts().map((a) => (a.id === MELAMINE_ID ? { ...a, value: null } : a))
    const job = shelfJob()
    const dims = legacyComputeDimensions(job, usableAdjusts(rows))
    const shelf = dims.parts.find((p) => p.name === '棚板')!
    expect(shelf.errors.map((e) => e.kind)).toContain('unknownAdjust')
    expect(formulaText(job.parts[3].expr.W, usableAdjusts(rows))).toBe('天板.W − 20 − （削除した調整寸法）')
  })

  it('寸法を入れ直すと、同じ id なので式が元に戻る', () => {
    const rows: AdjustRow[] = shelfAdjusts()
    const shelf = legacyComputeDimensions(shelfJob(), usableAdjusts(rows)).parts.find((p) => p.name === '棚板')!
    expect(shelf.errors).toEqual([])
    expect(shelf.finished?.W).toBe(379)
  })
})

describe('changedAdjusts（値・名前が変わる・消える・書きかけになる調整寸法）', () => {
  const before = [row('a', 'メラミン', 1), row('b', 'シート', 0.5), row('c', 'ほぞ', null)]

  it('寸法・名前を変えた、消した、書きかけにしたもの（前の一覧の並び）', () => {
    const after = [row('a', 'メラミン', 2), row('c', 'ほぞ', 15)]
    expect(changedAdjusts(before, after).map((a) => a.id)).toEqual(['a', 'b'])
    expect(changedAdjusts(before, [row('a', 'メラ', 1), row('b', 'シート', null)]).map((a) => a.id)).toEqual(['a', 'b'])
  })

  it('変わらなければ空。書きかけだった行の変化は数えない', () => {
    expect(changedAdjusts(before, [...before])).toEqual([])
    expect(changedAdjusts(before, [before[0], before[1]])).toEqual([])
  })
})

describe('adjustChangeUsages（変える・消すときの確認。仕様書 21.3）', () => {
  const other = (id: string, adjustId: string): Job => {
    const job = shelfJob(id, `仕事${id}`)
    job.parts[2].expr.H = `700 - {n:${adjustId}}`
    return job
  }

  it('今の仕事以外で使っていれば、その調整寸法と使っている所', () => {
    const jobs = [shelfJob('job-now', '今'), other('job-b', MELAMINE_ID), other('job-c', MELAMINE_ID)]
    const before = shelfAdjusts()
    const after = before.map((a) => (a.id === MELAMINE_ID ? { ...a, value: 2 } : a))
    const r = adjustChangeUsages(jobs, before, after, 'job-now')
    expect(r.changed.map((a) => a.id)).toEqual([MELAMINE_ID])
    expect(r.jobCount).toBe(3)
    expect(r.otherJobCount).toBe(2)
    expect(r.usages.map((u) => `${u.jobId} ${u.partName}`)).toEqual(['job-now 棚板', 'job-b 側板', 'job-b 棚板', 'job-c 側板', 'job-c 棚板'])
  })

  it('今の仕事でしか使っていなければ確認はいらない（changed が空）', () => {
    const jobs = [shelfJob('job-now', '今'), shelfJob('job-b', 'b')]
    jobs[1].parts[3].expr.W = '天板.W - 20'
    const before = shelfAdjusts()
    const after = before.filter((a) => a.id !== MELAMINE_ID)
    const r = adjustChangeUsages(jobs, before, after, 'job-now')
    expect(r.changed).toEqual([])
    expect(r.otherJobCount).toBe(0)
  })

  it('どこでも使っていない調整寸法を変えても確認はいらない', () => {
    const before = shelfAdjusts()
    const after = before.map((a) => (a.id === SHEET_ID ? { ...a, name: 'シートA' } : a))
    expect(adjustChangeUsages([other('job-b', MELAMINE_ID)], before, after, null).changed).toEqual([])
  })

  it('開いている仕事が無ければ、全部の仕事を「ほか」とみなす', () => {
    const before = shelfAdjusts()
    const after = before.map((a) => (a.id === MELAMINE_ID ? { ...a, value: null } : a))
    const r = adjustChangeUsages([shelfJob('job-a', 'a')], before, after, null)
    expect(r.changed.map((a) => a.id)).toEqual([MELAMINE_ID])
    expect(r.otherJobCount).toBe(1)
  })
})
