import { describe, expect, it } from 'vitest'
import { shelfJob } from '../engine/fixtures/shelf'
import { buildBackupFile } from '../engine/transfer/backup'
import { readTransferFile } from '../engine/transfer/read'
import { buildJobFile } from '../engine/transfer/share'
import { importSummary, shareResultText } from './transferView'

function read(text: string) {
  const r = readTransferFile(text)
  if (!r.ok) throw new Error(r.message)
  return r
}

describe('取り込みの確認の文言', () => {
  it('共有：「共有された仕事：本棚（部材 4件）」と「取り込む」', () => {
    const job = { ...shelfJob(), name: '本棚' }
    const s = importSummary(read(buildJobFile(job)))
    expect(s.title).toBe(`共有された仕事：本棚（部材 ${job.parts.length}件）`)
    expect(s.names).toEqual([])
    expect(s.action).toBe('取り込む')
  })

  it('バックアップ：仕事の数と名前、「追加する」。11件目からは「ほか」', () => {
    const jobs = Array.from({ length: 12 }, (_, i) => ({ ...shelfJob(), id: `j${i}`, name: i === 0 ? '' : `棚${i}` }))
    const s = importSummary(read(buildBackupFile({ jobs })))
    expect(s.title).toBe('バックアップ：仕事 12件')
    expect(s.names).toHaveLength(10)
    expect(s.names[0]).toBe('（名前なし）')
    expect(s.names[1]).toBe('棚1')
    expect(s.rest).toBe(2)
    expect(s.action).toBe('追加する')
  })
})

describe('送る・書き出すの結果', () => {
  it('送った・閉じたときは何も出さない。保存は知らせ、失敗は赤', () => {
    expect(shareResultText('shared', 'job')).toBeNull()
    expect(shareResultText('cancelled', 'backup')).toBeNull()
    expect(shareResultText('saved', 'job')?.ok).toBe(true)
    expect(shareResultText('saved', 'backup')?.text).toBe('バックアップのファイルを保存しました')
    expect(shareResultText('failed', 'job')).toEqual({ ok: false, text: 'ファイルを作れませんでした' })
  })
})
