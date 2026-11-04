// 見本の仕事（仕様書 16.7・19.1：6章の棚から「全体」を除いた 天板・側板・棚板）を作る。kidori の store/sample.ts を参考にしたもの。
// 設定は初期値。第2.2版（仕様書 26.1）から W・H は数字だけ（前の版の式 天板.W − 20 − メラミン1 などの値と同じ）
import type { Job, Part } from '../engine/types'
import { makeJob } from './jobs'

/** 見本の仕事の名前 */
export const SAMPLE_NAME = '見本 棚'

/** 見本の仕事を作る（純粋関数。押すたびに新しい id の仕事） */
export function sampleJob(now: Date, newId: (prefix: string) => string): Job {
  const job = makeJob(SAMPLE_NAME, now, newId('job'))
  const part = (name: string, W: string, H: string, quantity: number): Part => ({
    id: newId('part'),
    name,
    expr: { W, H },
    quantity,
    rotatable: false,
    finishedDone: false,
  })
  job.parts = [part('天板', '400', '1800', 1), part('側板', '400', '700', 2), part('棚板', '379', '1760', 3)]
  return job
}
