// ファイルから取り込む：今の保存データに足す（仕様書 15.3・15.4。kidori の importShared・importBackup を参考に作り直したもの）
import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../dimensions'
import { withHistory } from '../fixtures/history'
import { freezeAt } from '../fixtures/progress'
import { legacyShelfJob, MELAMINE_ID, shelfAdjusts, shelfJob } from '../fixtures/shelf'
import { legacyComputeDimensions } from '../migrate/legacyDimensions'
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
function receiver(): AppData {
  return { version: 1, jobs: [shelfJob('job-mine', '自分の仕事')], cellClip: null }
}

/** 寸法の値（名前・仕上がり・木取り・エラーの種類） */
const dimsOf = (job: Job) =>
  computeDimensions(job).parts.map((d) => [d.name, d.finished, d.cut, d.errors.map((e) => e.kind)])

describe('仕事1つのファイルを取り込む', () => {
  it('送って取り込むと、部材・設定・式の値が同じ仕事がコピーとして足される（今ある仕事は変えない）', () => {
    const src = shelfJob()
    src.settings = { ...src.settings, kerf: 4, allowance: 5, cutMode: 'horizontal' }
    const data = receiver()
    const before = JSON.parse(JSON.stringify(data))
    const r = importTransfer(data, readFile(buildJobFile(src)), ids(), NOW)
    expect(data).toEqual(before)
    expect(r.data.jobs).toHaveLength(2)
    expect(r.data.jobs[0]).toEqual(before.jobs[0])
    const got = r.data.jobs[1]
    expect(r.jobIds).toEqual([got.id])
    expect(got.name).toBe('棚')
    expect(got.settings).toEqual(src.settings)
    expect(got.parts.map((p) => [p.name, p.quantity, p.rotatable])).toEqual(src.parts.map((p) => [p.name, p.quantity, p.rotatable]))
    expect(dimsOf(got)).toEqual(dimsOf(src))
    expect(packJob(got, computeDimensions(got)).sheetCount).toBe(packJob(src, computeDimensions(src)).sheetCount)
    expect(r.data.cellClip).toBeNull()
  })

  it('仕事と部材の id は新しくする。作った日・変えた日は取り込んだ時刻', () => {
    const src = shelfJob()
    const r = importTransfer(receiver(), readFile(buildJobFile(src)), ids(), NOW)
    const got = r.data.jobs[1]
    expect(got.id).not.toBe(src.id)
    expect(got.parts.map((p) => p.id).some((id) => src.parts.some((p) => p.id === id))).toBe(false)
    expect(new Set(got.parts.map((p) => p.id)).size).toBe(4)
    expect([got.createdAt, got.updatedAt]).toEqual([NOW.toISOString(), NOW.toISOString()])
  })

  it('同じ名前の仕事があれば「棚のコピー」、それもあれば「棚のコピー2」', () => {
    const text = buildJobFile(shelfJob())
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
    const file = readFile(buildJobFile(src))
    if (file.kind !== 'job') throw new Error('job でない')
    const r = importTransfer(receiver(), { ...file, job: { ...file.job, history: src.history } }, ids(), NOW)
    expect(r.data.jobs[1].history).toEqual([])
  })

  it('知らせの文：「棚」を取り込みました', () => {
    expect(importTransfer(receiver(), readFile(buildJobFile(shelfJob())), ids(), NOW).message).toBe('「棚」を取り込みました')
  })
})

describe('バックアップを取り込む', () => {
  /** 送る人の保存データ：使いかけの棚（チェックあり・完了あり）と、まだの棚 */
  function sender(): AppData {
    const used = freezeAt(shelfJob('job-a', '棚A'), 0, { partId: 'part-gawaita', n: 2 })
    used.parts[1] = { ...used.parts[1], finishedDone: true }
    used.parts[2].expr.H = '699.5'
    return { version: 1, jobs: [used, shelfJob('job-b', '棚B')], cellClip: null }
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
    expect(packJob(a, computeDimensions(a)).sheetCount).toBe(packJob(orig, computeDimensions(orig)).sheetCount)
    expect(dimsOf(a)).toEqual(dimsOf(orig))
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

  it('同じバックアップを2回取り込んでも上書きせず、名前を変えて足す', () => {
    const text = buildBackupFile(sender())
    const newId = ids()
    let data = receiver()
    data = importTransfer(data, readFile(text), newId, NOW).data
    data = importTransfer(data, readFile(text), newId, NOW).data
    expect(data.jobs.map((j) => j.name)).toEqual(['自分の仕事', '棚A', '棚B', '棚Aのコピー', '棚Bのコピー'])
    expect(new Set(data.jobs.map((j) => j.id)).size).toBe(5)
  })

  it('バックアップの中で同じ名前の仕事どうしも重ならない名前にする', () => {
    const src: AppData = { version: 1, jobs: [shelfJob('a', '棚'), shelfJob('b', '棚')], cellClip: null }
    const r = importTransfer(receiver(), readFile(buildBackupFile(src)), ids(), NOW)
    expect(r.data.jobs.map((j) => j.name)).toEqual(['自分の仕事', '棚', '棚のコピー'])
  })
})

describe('前の版のファイルの式を数字に置き換える（第2.2版。仕様書 26.4）', () => {
  /** 前の版の送るファイル（式と、その式で使う調整寸法の一覧つき） */
  const legacyJobFile = (job: Job, adjusts: Adjust[] = shelfAdjusts()): TransferFile => ({ app: 'kidori-simple', kind: 'job', version: 1, job, adjusts })

  it('送るファイル：ファイルの中の調整寸法で計算した仕上がり寸法の数字になる（天板 400×1800・側板 400×700・棚板 379×1760）', () => {
    const r = importTransfer(receiver(), legacyJobFile(legacyShelfJob()), ids(), NOW)
    expect(r.data.jobs[1].parts.map((p) => [p.name, p.expr.W, p.expr.H])).toEqual(shelfJob().parts.map((p) => [p.name, p.expr.W, p.expr.H]))
    expect(r.numbering).toEqual({ replaced: true, cleared: [] })
  })

  it('受け取る人の調整寸法ではなく、ファイルの中の一覧で計算する（ファイルがメラミン2 なら 378）', () => {
    const file = legacyJobFile(legacyShelfJob(), [{ id: MELAMINE_ID, name: 'メラミン', value: 2 }])
    expect(importTransfer(receiver(), file, ids(), NOW).data.jobs[1].parts[3].expr.W).toBe('378')
  })

  it('エラーの式は空にし、取り込んだあとの仕事の名前・id で返す', () => {
    const src = legacyShelfJob()
    src.parts[2].expr.H = '地板.H'
    const data: AppData = { ...receiver(), jobs: [shelfJob('x', '棚')] }
    const r = importTransfer(data, legacyJobFile(src), ids(), NOW)
    const got = r.data.jobs[1]
    expect(got.name).toBe('棚のコピー')
    expect(got.parts[2].expr).toEqual({ W: '400', H: '' })
    expect(r.numbering.cleared).toEqual([{ jobId: got.id, jobName: '棚のコピー', partName: '側板', axis: 'H' }])
  })

  it('バックアップ：全部の仕事と履歴の中の部材を置き換える。並べ方の結果は前と同じ', () => {
    const a = withHistory(legacyShelfJob('job-a', '棚A'), 'h-1', '初めの案')
    const file: TransferFile = { app: 'kidori-simple', kind: 'backup', version: 1, jobs: [a, shelfJob('job-b', '棚B')], adjusts: shelfAdjusts() }
    const r = importTransfer(receiver(), file, ids(), NOW)
    const got = r.data.jobs[1]
    expect(got.parts.map((p) => p.expr)).toEqual(shelfJob().parts.map((p) => p.expr))
    expect(got.history[0].parts.map((p) => p.expr)).toEqual(shelfJob().parts.map((p) => p.expr))
    expect(r.numbering).toEqual({ replaced: true, cleared: [] })
    // 部材の id は振り直すので、id を除いて比べる
    const shape = (res: ReturnType<typeof packJob>) => ({
      ...res,
      sheets: res.sheets.map((sh) => ({ ...sh, placements: sh.placements.map(({ partId: _p, pieceId: _q, ...pl }) => pl) })),
    })
    expect(shape(packJob(got, computeDimensions(got)))).toEqual(shape(packJob(a, legacyComputeDimensions(a, shelfAdjusts()))))
  })

  it('調整寸法の一覧は持たない（式は数字にしたので、取り込んだあとは使わない）', () => {
    const r = importTransfer(receiver(), { app: 'kidori-simple', kind: 'job', version: 1, job: legacyShelfJob(), adjusts: shelfAdjusts() }, ids(), NOW)
    expect(Object.keys(r.data).sort()).toEqual(['cellClip', 'jobs', 'version'])
  })

  it('数字だけのファイルは置き換えない（replaced: false）', () => {
    const file = legacyJobFile(shelfJob(), [])
    expect(importTransfer(receiver(), file, ids(), NOW).numbering).toEqual({ replaced: false, cleared: [] })
  })
})
