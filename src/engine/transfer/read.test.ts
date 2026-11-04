// ファイルから取り込む：読み込みと確認のまとめ（仕様書 15.3・15.4。kidori の store/transfer/read.test.ts を参考に作り直したもの）
import { describe, expect, it } from 'vitest'
import { withHistory } from '../fixtures/history'
import { shelfAdjusts, shelfJob } from '../fixtures/shelf'
import { buildBackupFile } from './backup'
import { MAX_TRANSFER_SIZE, READ_FAILED } from './envelope'
import { readTransferFile } from './read'
import { buildJobFile } from './share'

const failed = { ok: false, message: '読み込めませんでした' }

describe('readTransferFile：読めるファイル', () => {
  it('仕事1つのファイル：種類 job と、確認に出す仕事の名前・部材の数', () => {
    const r = readTransferFile(buildJobFile(shelfJob(), shelfAdjusts()))
    expect(r.ok).toBe(true)
    if (!r.ok || r.kind !== 'job') throw new Error('読めない')
    expect(r.summary).toEqual({ jobName: '棚', partCount: 4 })
    expect(r.file.job.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板', '棚板'])
    // 第2.2版から式は無いので、送るファイルに入る調整寸法も無い
    expect(r.file.adjusts).toEqual([])
  })

  it('バックアップ：種類 backup と、確認に出す仕事の数・名前', () => {
    const r = readTransferFile(buildBackupFile({ jobs: [shelfJob('a', '本棚'), shelfJob('b', '食器棚')], adjusts: shelfAdjusts() }))
    expect(r.ok).toBe(true)
    if (!r.ok || r.kind !== 'backup') throw new Error('読めない')
    expect(r.summary).toEqual({ jobCount: 2, jobNames: ['本棚', '食器棚'] })
    expect(r.file.adjusts).toHaveLength(2)
  })

  it('名前が空・枚数が空の部材があっても読める', () => {
    const job = shelfJob()
    job.parts.push({ id: 'p5', name: '', expr: { W: '300', H: '400' }, quantity: null, rotatable: false, finishedDone: false })
    const r = readTransferFile(buildJobFile(job, shelfAdjusts()))
    expect(r.ok && r.kind === 'job' && r.summary.partCount).toBe(5)
  })

  it('第1.3版までの切り方「おまかせ」（auto）の仕事・バックアップは、縦切り優先にして読む（仕様書 18.2）', () => {
    const auto = (j: ReturnType<typeof shelfJob>) => JSON.parse(JSON.stringify(j).replace('"cutMode":"vertical"', '"cutMode":"auto"'))
    const one = readTransferFile(buildJobFile(auto(shelfJob()), shelfAdjusts()))
    expect(one.ok && one.kind === 'job' && one.file.job.settings.cutMode).toBe('vertical')
    const h = shelfJob('b', '食器棚')
    h.settings.cutMode = 'horizontal'
    const backup = readTransferFile(buildBackupFile({ jobs: [auto(shelfJob('a', '本棚')), h], adjusts: shelfAdjusts() }))
    expect(backup.ok && backup.kind === 'backup' && backup.file.jobs.map((j) => j.settings.cutMode)).toEqual(['vertical', 'horizontal'])
  })

  it('第2.0版までの送るファイル・バックアップ（仕事に履歴が無い）も読め、履歴は空になる（第2.1版）', () => {
    const noHistory = (text: string) => {
      const d = JSON.parse(text)
      for (const j of d.kind === 'job' ? [d.job] : d.jobs) delete j.history
      return JSON.stringify(d)
    }
    const one = readTransferFile(noHistory(buildJobFile(shelfJob(), shelfAdjusts())))
    expect(one.ok && one.kind === 'job' && one.file.job.history).toEqual([])
    const old = noHistory(buildBackupFile({ jobs: [withHistory(shelfJob('a', '本棚'), 'h-1'), shelfJob('b', '食器棚')], adjusts: shelfAdjusts() }))
    expect(old).not.toContain('"history"')
    const backup = readTransferFile(old)
    expect(backup.ok && backup.kind === 'backup' && backup.file.jobs.map((j) => j.history)).toEqual([[], []])
  })

  it('履歴の入ったバックアップを読める', () => {
    const job = withHistory(shelfJob('a', '本棚'), 'h-1', '初めの案')
    const r = readTransferFile(buildBackupFile({ jobs: [job], adjusts: shelfAdjusts() }))
    expect(r.ok && r.kind === 'backup' && r.file.jobs[0].history).toEqual(job.history)
  })

  it('分ける前のアプリ（キドリライト：app kidori-lite）の送るファイル・バックアップも読める', () => {
    const job = JSON.parse(buildJobFile(shelfJob(), shelfAdjusts()))
    const r = readTransferFile(JSON.stringify({ ...job, app: 'kidori-lite' }))
    expect(r.ok && r.kind === 'job' && r.file.app).toBe('kidori-simple')
    const backup = JSON.parse(buildBackupFile({ jobs: [shelfJob()], adjusts: shelfAdjusts() }))
    const b = readTransferFile(JSON.stringify({ ...backup, app: 'kidori-lite' }))
    expect(b.ok && b.kind === 'backup' && b.file.jobs.length).toBe(1)
  })

  it('先頭に BOM があっても読める', () => {
    expect(readTransferFile(`﻿${buildJobFile(shelfJob(), shelfAdjusts())}`).ok).toBe(true)
  })
})

describe('readTransferFile：読めないファイルは「読み込めませんでした」', () => {
  const job = () => JSON.parse(buildJobFile(shelfJob(), shelfAdjusts()))
  const backup = () => JSON.parse(buildBackupFile({ jobs: [shelfJob()], adjusts: shelfAdjusts() }))

  it('文言', () => {
    expect(READ_FAILED).toBe('読み込めませんでした')
  })

  it.each([
    ['空', ''],
    ['空白だけ', '   '],
    ['JSON でない', '{こわれた'],
    ['途中で切れた', buildJobFile(shelfJob(), shelfAdjusts()).slice(0, 100)],
    ['null', 'null'],
    ['配列', '[]'],
    ['文字', '"kidori-simple"'],
    ['写真などほかのファイル', '\u0089PNG\r\n'],
  ])('%s', (_label, text) => {
    expect(readTransferFile(text)).toEqual(failed)
  })

  it.each([
    ['kidori の共有のファイル', { app: 'kidori', kind: 'share', version: 1, dataVersion: 3, exportedAt: '2026-10-22T00:00:00.000Z', job: shelfJob() }],
    ['kidori のバックアップ', { app: 'kidori', kind: 'backup', version: 1, dataVersion: 3, exportedAt: '2026-10-22T00:00:00.000Z', jobs: [] }],
    ['app が無い', { ...job(), app: undefined }],
    ['kind が違う（kidori の share）', { ...job(), kind: 'share' }],
    ['version が違う', { ...job(), version: 2 }],
    ['job が無い', { ...job(), job: undefined }],
    ['job の部材の枚数がおかしい', { ...job(), job: { ...shelfJob(), parts: [{ ...shelfJob().parts[0], quantity: -1 }] } }],
    ['job の設定が無い', { ...job(), job: { ...shelfJob(), settings: undefined } }],
    ['adjusts が無い', { ...job(), adjusts: undefined }],
    ['調整寸法の寸法が 0', { ...job(), adjusts: [{ id: 'a', name: '逃げ', value: 0 }] }],
    ['jobs が配列でない', { ...backup(), jobs: {} }],
    ['jobs の中に読めない仕事', { ...backup(), jobs: [shelfJob(), { id: 'x' }] }],
    ['バックアップに adjusts が無い', { ...backup(), adjusts: undefined }],
  ])('%s', (_label, data) => {
    expect(readTransferFile(JSON.stringify(data))).toEqual(failed)
  })

  it('大きすぎる（20MB 超）', () => {
    expect(readTransferFile(' '.repeat(MAX_TRANSFER_SIZE + 1))).toEqual(failed)
  })
})
