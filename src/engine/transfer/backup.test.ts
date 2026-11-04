// バックアップのファイル（仕様書 15.4。kidori の store/transfer/backup.test.ts を参考に作り直したもの）
import { describe, expect, it } from 'vitest'
import { withHistory } from '../fixtures/history'
import { freezeAt } from '../fixtures/progress'
import { shelfJob } from '../fixtures/shelf'
import { backupFile, backupFileName, buildBackupFile } from './backup'

describe('backupFile・buildBackupFile', () => {
  it('外側は app: kidori-simple・kind: backup・version 1・jobs・adjusts だけ。空白なしの JSON', () => {
    const text = buildBackupFile({ jobs: [shelfJob()] })
    const data = JSON.parse(text)
    expect(Object.keys(data).sort()).toEqual(['adjusts', 'app', 'jobs', 'kind', 'version'])
    expect([data.app, data.kind, data.version]).toEqual(['kidori-simple', 'backup', 1])
    expect(text).not.toMatch(/\n/)
  })

  it('全部の仕事（切り出しチェック・仕上がりの完了も）をそのまま。調整寸法は空の並び（第2.2版。ファイルの形は変えない）', () => {
    const used = freezeAt(shelfJob('job-a', '棚A'), 0, { partId: 'part-gawaita', n: 1 })
    used.parts[1] = { ...used.parts[1], finishedDone: true }
    const f = backupFile({ jobs: [used, shelfJob('job-b', '棚B')] })
    expect(f.jobs).toEqual([used, shelfJob('job-b', '棚B')])
    expect(f.adjusts).toEqual([])
  })

  it('履歴も入れる（第2.1版。仕様書 25.1）', () => {
    const job = withHistory(shelfJob('job-a', '棚A'), 'h-1', '初めの案')
    const f = JSON.parse(buildBackupFile({ jobs: [job] }))
    expect(f.jobs[0].history).toEqual(job.history)
  })

  it('仕事が無くても作れる', () => {
    expect(backupFile({ jobs: [] })).toEqual({ app: 'kidori-simple', kind: 'backup', version: 1, jobs: [], adjusts: [] })
  })
})

describe('backupFileName', () => {
  it('kidori-simple-バックアップ-YYYY-MM-DD.json（端末の日付。月・日は2桁）', () => {
    expect(backupFileName(new Date(2026, 9, 22, 23, 59))).toBe('kidori-simple-バックアップ-2026-10-22.json')
    expect(backupFileName(new Date(2027, 0, 5, 0, 0))).toBe('kidori-simple-バックアップ-2027-01-05.json')
  })
})
