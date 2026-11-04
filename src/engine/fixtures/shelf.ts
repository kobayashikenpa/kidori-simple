// 仕様書 6章の例（全体・天板・側板・棚板）。テストで使う。呼ぶたびに新しいオブジェクト
// 第2.2版（仕様書 26.1）から W・H は数字だけなので、shelfJob は仕上がり寸法の数字で持つ。
// 前の版の式で入れた形は legacyShelfJob（前のデータの置き換え＝仕様書 26.4 のテストで使う）
import { createJob } from '../defaults'
import type { Adjust, Job, Part } from '../types'

export const MELAMINE_ID = 'adjust-melamine'
export const SHEET_ID = 'adjust-sheet'

/** 前の版の初期の調整寸法（メラミン1・シート0.5）を、決まった id で（前のデータの置き換えのテスト用） */
export function shelfAdjusts(): Adjust[] {
  return [
    { id: MELAMINE_ID, name: 'メラミン', value: 1 },
    { id: SHEET_ID, name: 'シート', value: 0.5 },
  ]
}

function part(id: string, name: string, W: string, H: string, quantity: number): Part {
  return { id, name, expr: { W, H }, quantity, rotatable: false, finishedDone: false }
}

/**
 * 仕様書 6章の棚（仕上がり寸法の数字）。
 * 回転しない部材は W を板の妻手に置くので、W が短い形（全体 W400×H1800）にしている。
 * 仕上がり／木取り（切り代10）：天板 400×1800 / 410×1810、側板 400×700 / 410×710、棚板 379×1760 / 389×1770
 */
export function shelfJob(id = 'job-shelf', name = '棚'): Job {
  const job = createJob({ id, name, now: '2026-10-20T00:00:00.000Z' })
  job.parts = [
    part('part-zentai', '全体', '400', '1800', 0),
    part('part-tenita', '天板', '400', '1800', 1),
    part('part-gawaita', '側板', '400', '700', 2),
    part('part-tanaita', '棚板', '379', '1760', 3),
  ]
  return job
}

/**
 * 前の版（第2.1版まで）の式で入れた 6章の棚。棚板の「メラミン1」は {n:adjust-melamine}（shelfAdjusts）。
 * 置き換えると shelfJob と同じ数字になる
 */
export function legacyShelfJob(id = 'job-shelf', name = '棚'): Job {
  const job = createJob({ id, name, now: '2026-10-20T00:00:00.000Z' })
  job.parts = [
    part('part-zentai', '全体', '400', '1800', 0),
    part('part-tenita', '天板', '全体.W', '全体.H', 1),
    part('part-gawaita', '側板', '全体.W', '700', 2),
    part('part-tanaita', '棚板', `天板.W - 20 - {n:${MELAMINE_ID}}`, '天板.H - 20 × 2', 3),
  ]
  return job
}
