// ファイルから取り込む：今の保存データに足す（仕様書 15.3・15.4。kidori の importShared・importBackup を参考に作り直したもの）
import { usableAdjusts } from '../adjusts'
import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../dimensions'
import { withHistory } from '../fixtures/history'
import { freezeAt } from '../fixtures/progress'
import { MELAMINE_ID, SHEET_ID, shelfAdjusts, shelfJob } from '../fixtures/shelf'
import { packJob } from '../packing'
import { partCutProgress } from '../progress/partProgress'
import type { Adjust, AppData, Job } from '../types'
import { buildBackupFile } from './backup'
import type { TransferFile } from './envelope'
import { importTransfer } from './importFile'
import { readTransferFile } from './read'
import { buildJobFile } from './share'

const NOW = new Date('2026-10-22T09:00:00.000Z')

function ids() {
  let n = 0
  return (prefix: string) => `${prefix}-new-${++n}`
}

/** ファイルの文字を読んで、中身を返す（読めなければ止める） */
function readFile(text: string): TransferFile {
  const r = readTransferFile(text)
  if (!r.ok) throw new Error(r.message)
  return r.file
}

/** 受け取る人の保存データ（調整寸法の id は送る人と違う） */
function receiver(adjusts: Adjust[] = [{ id: 'r-mel', name: 'メラミン', value: 1 }, { id: 'r-sheet', name: 'シート', value: 0.5 }]): AppData {
  return { version: 1, jobs: [shelfJob('job-mine', '自分の仕事')], adjusts, cellClip: null, adjustClip: null }
}

/** 寸法の値（名前・仕上がり・木取り・エラーの種類）。調整寸法の id によらず比べられる */
const dimsOf = (job: Job, adjusts: readonly Adjust[]) =>
  computeDimensions(job, adjusts).parts.map((d) => [d.name, d.finished, d.cut, d.errors.map((e) => e.kind)])

describe('仕事1つのファイルを取り込む', () => {
  it('送って取り込むと、部材・設定・式の値が同じ仕事がコピーとして足される（今ある仕事は変えない）', () => {
    const src = shelfJob()
    src.settings = { ...src.settings, kerf: 4, allowance: 5, cutMode: 'horizontal' }
    const data = receiver()
    const before = JSON.parse(JSON.stringify(data))
    const r = importTransfer(data, readFile(buildJobFile(src, shelfAdjusts())), ids(), NOW)
    expect(data).toEqual(before)
    expect(r.data.jobs).toHaveLength(2)
    expect(r.data.jobs[0]).toEqual(before.jobs[0])
    const got = r.data.jobs[1]
    expect(r.jobIds).toEqual([got.id])
    expect(got.name).toBe('棚')
    expect(got.settings).toEqual(src.settings)
    expect(got.parts.map((p) => [p.name, p.quantity, p.rotatable])).toEqual(src.parts.map((p) => [p.name, p.quantity, p.rotatable]))
    expect(dimsOf(got, usableAdjusts(r.data.adjusts))).toEqual(dimsOf(src, shelfAdjusts()))
    expect(packJob(got, computeDimensions(got, usableAdjusts(r.data.adjusts))).sheetCount).toBe(packJob(src, computeDimensions(src, shelfAdjusts())).sheetCount)
    expect(r.data.cellClip).toBeNull()
  })

  it('仕事と部材の id は新しくする。作った日・変えた日は取り込んだ時刻', () => {
    const src = shelfJob()
    const r = importTransfer(receiver(), readFile(buildJobFile(src, shelfAdjusts())), ids(), NOW)
    const got = r.data.jobs[1]
    expect(got.id).not.toBe(src.id)
    expect(got.parts.map((p) => p.id).some((id) => src.parts.some((p) => p.id === id))).toBe(false)
    expect(new Set(got.parts.map((p) => p.id)).size).toBe(4)
    expect([got.createdAt, got.updatedAt]).toEqual([NOW.toISOString(), NOW.toISOString()])
  })

  it('メラミン1 が両方にあれば増えない（受け取る人のメラミン1 を使う）', () => {
    const r = importTransfer(receiver(), readFile(buildJobFile(shelfJob(), shelfAdjusts())), ids(), NOW)
    expect(r.data.adjusts.map((a) => a.id)).toEqual(['r-mel', 'r-sheet'])
    expect(r.addedAdjusts).toEqual([])
    expect(r.data.jobs[1].parts[3].expr.W).toBe('天板.W - 20 - {n:r-mel}')
  })

  it('メラミン1 が無ければ新しい id で足し、式の {n:id} をつけ替える', () => {
    const r = importTransfer(receiver([{ id: 'r-hozo', name: 'ほぞ', value: 15 }]), readFile(buildJobFile(shelfJob(), shelfAdjusts())), ids(), NOW)
    expect(r.data.adjusts.map((a) => [a.name, a.value])).toEqual([
      ['ほぞ', 15],
      ['メラミン', 1],
    ])
    const added = r.data.adjusts[1]
    expect(added.id).not.toBe(MELAMINE_ID)
    expect(r.addedAdjusts).toEqual([added])
    expect(r.data.jobs[1].parts[3].expr.W).toBe(`天板.W - 20 - {n:${added.id}}`)
    expect(dimsOf(r.data.jobs[1], usableAdjusts(r.data.adjusts))).toEqual(dimsOf(shelfJob(), shelfAdjusts()))
  })

  it('名前が同じでも寸法が違えば別の調整寸法として足す（メラミン1.2 と メラミン1）', () => {
    const r = importTransfer(receiver([{ id: 'r-mel', name: 'メラミン', value: 1.2 }]), readFile(buildJobFile(shelfJob(), shelfAdjusts())), ids(), NOW)
    expect(r.data.adjusts.map((a) => [a.name, a.value])).toEqual([
      ['メラミン', 1.2],
      ['メラミン', 1],
    ])
  })

  it('表示名の比べは全角・半角と前後の空白をそろえる（adjustNameKey）', () => {
    const r = importTransfer(receiver([{ id: 'r-x', name: 'ｍｍ ', value: 1 }]), readFile(buildJobFile(oneAdjustJob(), [{ id: 's-x', name: 'mm', value: 1 }])), ids(), NOW)
    expect(r.data.adjusts.map((a) => a.id)).toEqual(['r-x'])
    expect(r.data.jobs[1].parts[0].expr.W).toBe('100 + {n:r-x}')
  })

  it('削除した調整寸法（ファイルに無い id）を使っている式はそのまま（取り込んだあともエラー）', () => {
    const src = shelfJob()
    src.parts[2].expr.H = '700 - {n:gone}'
    const r = importTransfer(receiver(), readFile(buildJobFile(src, shelfAdjusts())), ids(), NOW)
    expect(r.data.jobs[1].parts[2].expr.H).toBe('700 - {n:gone}')
    expect(dimsOf(r.data.jobs[1], usableAdjusts(r.data.adjusts))[2][3]).toEqual(['unknownAdjust'])
  })

  it('同じ名前の仕事があれば「棚のコピー」、それもあれば「棚のコピー2」', () => {
    const text = buildJobFile(shelfJob(), shelfAdjusts())
    let data: AppData = { ...receiver(), jobs: [shelfJob('x', '棚')] }
    data = importTransfer(data, readFile(text), ids(), NOW).data
    expect(data.jobs.map((j) => j.name)).toEqual(['棚', '棚のコピー'])
    data = importTransfer(data, readFile(text), ids(), NOW).data
    expect(data.jobs.map((j) => j.name)).toEqual(['棚', '棚のコピー', '棚のコピー2'])
  })

  it('切り出しチェックと仕上がりの完了は入らない（ファイルに入っていても外す）', () => {
    const used = freezeAt(shelfJob(), 0, { partId: 'part-gawaita', n: 1 })
    used.parts[1] = { ...used.parts[1], finishedDone: true }
    const file: TransferFile = { app: 'kidori-simple', kind: 'job', version: 1, job: used, adjusts: shelfAdjusts() }
    const got = importTransfer(receiver(), file, ids(), NOW).data.jobs[1]
    expect(got.frozenSheets).toEqual([])
    expect(got.parts.some((p) => p.finishedDone)).toBe(false)
  })

  it('履歴は入らない（ファイルに入っていても外す。第2.1版）', () => {
    const src = withHistory(shelfJob(), 'h-1', '初めの案')
    const file = readFile(buildJobFile(src, shelfAdjusts()))
    if (file.kind !== 'job') throw new Error('job でない')
    const r = importTransfer(receiver(), { ...file, job: { ...file.job, history: src.history } }, ids(), NOW)
    expect(r.data.jobs[1].history).toEqual([])
  })

  it('知らせの文：「棚」を取り込みました', () => {
    expect(importTransfer(receiver(), readFile(buildJobFile(shelfJob(), shelfAdjusts())), ids(), NOW).message).toBe('「棚」を取り込みました')
  })
})

describe('バックアップを取り込む', () => {
  /** 送る人の保存データ：使いかけの棚（チェックあり・完了あり）と、まだの棚 */
  function sender(): AppData {
    const used = freezeAt(shelfJob('job-a', '棚A'), 0, { partId: 'part-gawaita', n: 2 })
    used.parts[1] = { ...used.parts[1], finishedDone: true }
    used.parts[2].expr.H = `700 - {n:${SHEET_ID}}`
    return { version: 1, jobs: [used, shelfJob('job-b', '棚B')], adjusts: shelfAdjusts(), cellClip: null, adjustClip: null }
  }

  it('全部の仕事がコピーとして足され、切り出しチェック・仕上がりの完了も戻る', () => {
    const src = sender()
    const r = importTransfer(receiver(), readFile(buildBackupFile(src)), ids(), NOW)
    expect(r.data.jobs.map((j) => j.name)).toEqual(['自分の仕事', '棚A', '棚B'])
    expect(r.jobIds).toEqual([r.data.jobs[1].id, r.data.jobs[2].id])
    const a = r.data.jobs[1]
    const orig = src.jobs[0]
    expect(a.parts.map((p) => p.finishedDone)).toEqual(orig.parts.map((p) => p.finishedDone))
    expect(a.frozenSheets).toHaveLength(1)
    expect(a.frozenSheets[0].checked).toHaveLength(2)
    expect(a.frozenSheets[0].completedAt).toBe(orig.frozenSheets[0].completedAt)
    // 進み具合・必要な枚数も同じ
    expect(partCutProgress(a).map((p) => [p.name, p.done, p.total])).toEqual(partCutProgress(orig).map((p) => [p.name, p.done, p.total]))
    expect(packJob(a, computeDimensions(a, usableAdjusts(r.data.adjusts))).sheetCount).toBe(packJob(orig, computeDimensions(orig, usableAdjusts(src.adjusts))).sheetCount)
    expect(dimsOf(a, usableAdjusts(r.data.adjusts))).toEqual(dimsOf(orig, usableAdjusts(src.adjusts)))
    expect(r.message).toBe('2件の仕事を追加しました')
  })

  it('固定した1枚の id・片の部材の id・pieceId・チェックを新しい部材の id につけ替える。作った日・変えた日はファイルのまま', () => {
    const src = sender()
    const a = importTransfer(receiver(), readFile(buildBackupFile(src)), ids(), NOW).data.jobs[1]
    const orig = src.jobs[0]
    const fs = a.frozenSheets[0]
    expect(fs.id).not.toBe(orig.frozenSheets[0].id)
    const partIds = new Set(a.parts.map((p) => p.id))
    expect(fs.layout.placements.every((pl) => partIds.has(pl.partId) && pl.pieceId.startsWith(`${pl.partId}#`))).toBe(true)
    const pieceIds = new Set(fs.layout.placements.map((pl) => pl.pieceId))
    expect(fs.checked.every((c) => pieceIds.has(c))).toBe(true)
    expect([a.createdAt, a.updatedAt]).toEqual([orig.createdAt, orig.updatedAt])
    // 元のデータは変えない
    expect(orig.frozenSheets[0].layout.placements[0].partId.startsWith('part-')).toBe(true)
  })

  it('調整寸法は表示名が同じならそれを使い、無ければ足す（全部の仕事で同じつけ替え）', () => {
    const r = importTransfer(receiver([{ id: 'r-mel', name: 'メラミン', value: 1 }]), readFile(buildBackupFile(sender())), ids(), NOW)
    expect(r.data.adjusts.map((a) => [a.name, a.value])).toEqual([
      ['メラミン', 1],
      ['シート', 0.5],
    ])
    const sheetId = r.data.adjusts[1].id
    expect(r.addedAdjusts.map((a) => a.id)).toEqual([sheetId])
    expect(r.data.jobs[1].parts[2].expr.H).toBe(`700 - {n:${sheetId}}`)
    expect(r.data.jobs[1].parts[3].expr.W).toBe('天板.W - 20 - {n:r-mel}')
    expect(r.data.jobs[2].parts[3].expr.W).toBe('天板.W - 20 - {n:r-mel}')
  })

  it('履歴も戻る（第2.1版）。履歴の部材の式の調整寸法 {n:id} も、今の一覧の id につけ替える', () => {
    const src = sender()
    src.jobs[0] = withHistory(withHistory(src.jobs[0], 'h-1', '初めの案'), 'h-2', '扉なし')
    const r = importTransfer(receiver([{ id: 'r-mel', name: 'メラミン', value: 1 }]), readFile(buildBackupFile(src)), ids(), NOW)
    const a = r.data.jobs[1]
    expect(a.history.map((h) => [h.id, h.memo, h.savedAt, h.sheetCount, h.yieldRate])).toEqual(
      src.jobs[0].history.map((h) => [h.id, h.memo, h.savedAt, h.sheetCount, h.yieldRate]),
    )
    expect(a.history[0].settings).toEqual(src.jobs[0].history[0].settings)
    const sheetId = r.data.adjusts[1].id
    expect(a.history[0].parts[3].expr.W).toBe('天板.W - 20 - {n:r-mel}')
    expect(a.history[0].parts[2].expr.H).toBe(`700 - {n:${sheetId}}`)
    expect(r.data.jobs[2].history).toEqual([])
    // 元のデータは変えない
    expect(src.jobs[0].history[0].parts[3].expr.W).toBe(`天板.W - 20 - {n:${MELAMINE_ID}}`)
  })

  it('同じバックアップを2回取り込んでも上書きせず、名前を変えて足す', () => {
    const text = buildBackupFile(sender())
    const newId = ids()
    let data = receiver()
    data = importTransfer(data, readFile(text), newId, NOW).data
    data = importTransfer(data, readFile(text), newId, NOW).data
    expect(data.jobs.map((j) => j.name)).toEqual(['自分の仕事', '棚A', '棚B', '棚Aのコピー', '棚Bのコピー'])
    expect(new Set(data.jobs.map((j) => j.id)).size).toBe(5)
    expect(data.adjusts).toHaveLength(2)
  })

  it('バックアップの中で同じ名前の仕事どうしも重ならない名前にする', () => {
    const src: AppData = { version: 1, jobs: [shelfJob('a', '棚'), shelfJob('b', '棚')], adjusts: shelfAdjusts(), cellClip: null, adjustClip: null }
    const r = importTransfer(receiver(), readFile(buildBackupFile(src)), ids(), NOW)
    expect(r.data.jobs.map((j) => j.name)).toEqual(['自分の仕事', '棚', '棚のコピー'])
  })
})

/** 部材1つ（W に調整寸法 {n:s-x} を使う）の仕事 */
function oneAdjustJob(): Job {
  const job = shelfJob()
  job.parts = [{ id: 'p1', name: '板', expr: { W: '100 + {n:s-x}', H: '200' }, quantity: 1, rotatable: false, finishedDone: false }]
  return job
}
