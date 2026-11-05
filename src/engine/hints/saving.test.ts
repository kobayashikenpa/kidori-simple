// 板を減らせるときのお知らせ（仕様書 19.2）。kidori の hints/saving.test.ts をもとに、材料ごと・フラッシュ・重ね切り・
// 部材ごとの切り代の上書きのテストを外し、板1種類（サブロク 910×1820）の形に直したもの。仕様書 6章（19.1 の見本）の棚の例を足した
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { shelfJob } from '../fixtures/shelf'
import { freezeAt } from '../fixtures/progress'
import type { Job, Part, Settings } from '../types'
import { findSavingHint, savingMessage, smallerSteps } from './saving'

function part(id: string, W: string, H: string, quantity: number, rotatable = false): Part {
  return { id, name: id, expr: { W, H }, quantity, rotatable, finishedDone: false }
}

/**
 * サブロク（910×1820）・刃厚3・端切り5・切り代10・縦切り優先に、W×1800（回転しない）の部材 側板 を置く。
 * 妻手方向に使える幅は 905。W の部材を2枚並べると (W + 切り代) × 2 + 刃厚3 が 905 以下なら1枚の板に入る
 */
function jobWith(w: number, quantity: number, settings: Partial<Settings> = {}): Job {
  const job = createJob({ id: 'job', name: '仕事', now: '2026-10-23T00:00:00.000Z' })
  job.settings = { ...job.settings, sheet: { sizeKind: 'saburoku', width: 910, length: 1820 }, allowance: 10, ...settings }
  job.parts = [part('側板', String(w), '1800', quantity)]
  return job
}

const hint = (job: Job) => findSavingHint(job)

describe('smallerSteps（試す値）', () => {
  it('今の値より小さい整数を 1 まで、最後に 0.5。0 は試さない', () => {
    expect(smallerSteps(10)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0.5])
    expect(smallerSteps(5)).toEqual([4, 3, 2, 1, 0.5])
    expect(smallerSteps(1)).toEqual([0.5])
  })

  it('今の値が小数なら切り捨てた値から', () => {
    expect(smallerSteps(7.5)).toEqual([7, 6, 5, 4, 3, 2, 1, 0.5])
    expect(smallerSteps(1.2)).toEqual([1, 0.5])
    expect(smallerSteps(0.8)).toEqual([0.5])
  })

  it('今の値が 0.5 以下なら何も試さない', () => {
    expect(smallerSteps(0.5)).toEqual([])
    expect(smallerSteps(0.3)).toEqual([])
    expect(smallerSteps(0)).toEqual([])
  })

  it('浮動小数の誤差があっても小数第1位でそろえる（0.1 + 0.2 + 0.7 は 1 とみなす）', () => {
    expect(smallerSteps(0.1 + 0.2 + 0.7)).toEqual([0.5])
  })
})

describe('savingMessage（お知らせの文）', () => {
  it('「切り代を 7mm にすると、板が 1 枚減ります」の形', () => {
    expect(savingMessage('allowance', 7, 2, 1)).toBe('切り代を 7mm にすると、板が 1 枚減ります')
    expect(savingMessage('trim', 0.5, 4, 2)).toBe('端切りを 0.5mm にすると、板が 2 枚減ります')
  })
})

describe('findSavingHint（板を減らせるときのお知らせ）', () => {
  it('切り代10・W445 ×4枚：9mm から順に試し、一番大きい 6mm を出す（451+3+451=905 ぴったり。7mm は 907 で入らない）', () => {
    expect(hint(jobWith(445, 4))).toEqual({
      change: { kind: 'allowance', value: 6 },
      from: 4,
      to: 2,
      message: '切り代を 6mm にすると、板が 2 枚減ります',
    })
  })

  it('7mm でぴったり入り 8mm では入らない（W444：451+3+451=905、452+3+452=907）→ 切り代を 7mm', () => {
    expect(hint(jobWith(444, 2))?.message).toBe('切り代を 7mm にすると、板が 1 枚減ります')
  })

  it('今の切り代が 8 なら 1mm だけ下げた 7mm を出す。切り代で減るので端切りのお知らせにはしない', () => {
    // 端切り3 でも減る（452+3+452=907 は 910-3=907 に入る）が、切り代を優先する
    expect(hint(jobWith(444, 2, { allowance: 8 }))?.change).toEqual({ kind: 'allowance', value: 7 })
  })

  it('今の切り代 7 で入っているなら何も出さない（1枚で足りる）', () => {
    expect(hint(jobWith(444, 2, { allowance: 7 }))).toBeNull()
  })

  it('今の値が小数（7.5）なら 7 から試す', () => {
    // W444・切り代7.5：451.5+3+451.5=906 で入らない。7 で入る
    expect(hint(jobWith(444, 2, { allowance: 7.5 }))?.change).toEqual({ kind: 'allowance', value: 7 })
  })

  it('最後に 0.5mm を試す（W450.5：切り代1 は 451.5+3+451.5=906 で入らず、0.5 で 905 ぴったり）', () => {
    expect(hint(jobWith(450.5, 2, { allowance: 5 }))?.message).toBe('切り代を 0.5mm にすると、板が 1 枚減ります')
  })

  it('切り代 0mm は試さない（W451・切り代1：0.5 は 906 で入らず、0 なら入るが試さない）→ 端切りを試して 3mm', () => {
    // 端切り t：452+3+452=907 ≤ 910 - t → t ≤ 3
    expect(hint(jobWith(451, 2, { allowance: 1 }))?.message).toBe('端切りを 3mm にすると、板が 1 枚減ります')
  })

  it('今の切り代が 0.5 なら切り代は試さず、端切りを試す（W451：906 ≤ 910 - 4）', () => {
    expect(hint(jobWith(451, 2, { allowance: 0.5 }))?.change).toEqual({ kind: 'trim', value: 4 })
  })

  it('端切りだけで減るとき（W452・切り代1：0.5 は 908 で入らない。端切り1 なら 909 に 909 がぴったり）', () => {
    expect(hint(jobWith(452, 2, { allowance: 1 }))?.message).toBe('端切りを 1mm にすると、板が 1 枚減ります')
  })

  it('端切り 0mm は試さない（W453.5・切り代0：910 は端切り0 でしか入らない）', () => {
    expect(hint(jobWith(453.5, 2, { allowance: 0 }))).toBeNull()
  })

  it('切り代0・W452（452+3+452=907 > 905）は切り代を試せないので端切りを試し、3mm で減る', () => {
    expect(hint(jobWith(452, 2, { allowance: 0 }))?.message).toBe('端切りを 3mm にすると、板が 1 枚減ります')
  })

  it('切り代0・W453 ×2枚 は 端切りを 1mm にすると 1枚減る（909 は 910 - 1 にぴったり。端切り2 では 908 で入らない）', () => {
    expect(hint(jobWith(453, 2, { allowance: 0 }))).toEqual({
      change: { kind: 'trim', value: 1 },
      from: 2,
      to: 1,
      message: '端切りを 1mm にすると、板が 1 枚減ります',
    })
  })

  it('刃厚ぶん入らないとき（W454：454+3+454=911 > 910）は端切りでも減らない', () => {
    expect(hint(jobWith(454, 2, { allowance: 0 }))).toBeNull()
  })

  it('端切りが小数（5.5）なら 5 から試す', () => {
    // W452・切り代0：907 ≤ 910 - t → t ≤ 3
    expect(hint(jobWith(452, 2, { allowance: 0, trim: 5.5 }))?.change).toEqual({ kind: 'trim', value: 3 })
  })

  it('切り代・端切りがともに 0 なら何も試さない', () => {
    expect(hint(jobWith(445, 4, { allowance: 0, trim: 0 }))).toBeNull()
  })

  it('切り代と端切りを同時に変える組み合わせは試さない（W452.5・切り代1・端切り5：どちらか片方だけでは入らない）', () => {
    // 切り代0.5・端切り5：906+... = 453+3+453=909 > 905。切り代1・端切り1：453.5+3+453.5=910 > 909。
    // 切り代0.5・端切り1 なら 909 ≤ 909 で入るが、同時には変えないので出さない
    expect(hint(jobWith(452.5, 2, { allowance: 1 }))).toBeNull()
  })

  it('入らない部材があっても、入らない部材が増えなければ減る枚数を知らせる', () => {
    // W1000 は どの切り代でも 905 に入らない（入らない部材 1 のまま）。側板 W445 ×4 は 6mm で 2 枚になる
    const job = jobWith(445, 4)
    job.parts.push(part('大板', '1000', '1800', 1))
    expect(hint(job)).toEqual({ change: { kind: 'allowance', value: 6 }, from: 4, to: 2, message: '切り代を 6mm にすると、板が 2 枚減ります' })
  })

  it('1枚で足りているなら試さない', () => {
    expect(hint(jobWith(300, 2))).toBeNull()
  })

  it('計算の前後で仕事のデータが変わらない', () => {
    const job = jobWith(445, 4)
    const before = structuredClone(job)
    hint(job)
    expect(job).toEqual(before)
  })

  it('切り代を変えた仕事を渡すと、すぐにそれに合わせたお知らせになる（前の結果を覚えていない）', () => {
    const at7 = jobWith(444, 2, { allowance: 7 })
    expect(hint(at7)).toBeNull()
    const at10 = { ...at7, settings: { ...at7.settings, allowance: 10 } }
    expect(hint(at10)?.message).toBe('切り代を 7mm にすると、板が 1 枚減ります')
    expect(hint(at7)).toBeNull()
  })

  it.each(['vertical', 'horizontal'] as const)('4×8（1220×2430）・W602 ×4・切り代5（%s）なら 4mm のお知らせ', (cutMode) => {
    // 縦切り優先：妻手方向に使える幅は 1220 - 5 = 1215。(602 + 切り代) × 2 + 3 は 切り代5 で 1217、4 で 1215 ぴったり
    // 横切り優先：下の長手と右の妻手を落とすので、妻手方向に使える幅は同じく 1215
    const job = createJob({ id: 'job', name: '仕事', now: '2026-10-23T00:00:00.000Z' })
    job.settings = { ...job.settings, allowance: 5, cutMode }
    job.parts = [part('背板', '602', '1200', 4)]
    expect(hint(job)?.message).toBe('切り代を 4mm にすると、板が 1 枚減ります')
  })
})

describe('仕様書 6章（19.1 の見本）の棚とお知らせ', () => {
  /** 19.1 の見本（全体なし）：天板 400×1800 ×1、側板 400×700 ×2、棚板 379×1760 ×3（第2.2版で数字だけに。前の版の式の値と同じ）。4×8 */
  function sampleJob(settings: Partial<Settings> = {}): Job {
    const job = createJob({ id: 'job-sample', name: '見本 棚', now: '2026-10-23T00:00:00.000Z' })
    // 6章の例は切り代 10（第2.3版で初期値は 0 になった。仕様書 27.6）
    job.settings = { ...job.settings, allowance: 10, ...settings }
    job.parts = [
      part('天板', '400', '1800', 1),
      part('側板', '400', '700', 2),
      part('棚板', '379', '1760', 3),
    ]
    return job
  }

  it('初期の設定（切り代10・端切り5）ではお知らせが出ない（4×8 で 2枚）', () => {
    expect(hint(sampleJob())).toBeNull()
    expect(hint(shelfJob())).toBeNull()
  })

  it('横切り優先で切り代を 11 にすると 3枚になり、「切り代を 10mm にすると、板が 1 枚減ります」', () => {
    expect(hint(sampleJob({ cutMode: 'horizontal', allowance: 11 }))).toEqual({
      change: { kind: 'allowance', value: 10 },
      from: 3,
      to: 2,
      message: '切り代を 10mm にすると、板が 1 枚減ります',
    })
    // 切り代を 10 に戻すと消える
    expect(hint(sampleJob({ cutMode: 'horizontal', allowance: 10 }))).toBeNull()
  })

  it('縦切り優先は切り代 25 で 3枚になり、一番大きい 24mm を知らせる（30 から下げても同じ）', () => {
    expect(hint(sampleJob({ allowance: 25 }))?.message).toBe('切り代を 24mm にすると、板が 1 枚減ります')
    expect(hint(sampleJob({ allowance: 30 }))?.message).toBe('切り代を 24mm にすると、板が 1 枚減ります')
    expect(hint(sampleJob({ allowance: 24 }))).toBeNull()
  })

  it('全体（枚数0）がある形（fixtures の shelfJob）でも同じ', () => {
    const job = shelfJob()
    job.settings.cutMode = 'horizontal'
    job.settings.allowance = 11
    expect(hint(job)?.message).toBe('切り代を 10mm にすると、板が 1 枚減ります')
  })
})

describe('固定した1枚とお知らせ（kidori と同じ：そのまま数え、残りの部材で試す）', () => {
  it('W445 ×4（4枚）の1枚目を固定しても、残りの3枚ぶんで試す：6mm で 3枚が 2枚になり、合わせて 4 → 3', () => {
    // 残り3枚の側板は 6mm で 2枚に入る（2枚＋1枚）。固定した1枚を足して 1 + 2 = 3
    const job = freezeAt(jobWith(445, 4), 0)
    expect(hint(job)).toEqual({ change: { kind: 'allowance', value: 6 }, from: 4, to: 3, message: '切り代を 6mm にすると、板が 1 枚減ります' })
  })

  it('全部の1枚を固定（切り終わり）にしたら、減らせないのでお知らせは出ない', () => {
    let job = jobWith(445, 4)
    for (let i = 0; i < 4; i++) job = freezeAt(job, 0, { partId: '側板', n: 1 })
    expect(hint(job)).toBeNull()
  })
})

describe('計算の量', () => {
  it('部材120枚（12種×10枚・回転あり／なし）・端切り5・切り代10 でも 1 秒以内に終わる', () => {
    for (const cutMode of ['vertical', 'horizontal'] as const) {
      const job = createJob({ id: 'job', name: '仕事', now: '2026-10-23T00:00:00.000Z' })
      job.settings = { ...job.settings, trim: 5, allowance: 10, cutMode }
      job.parts = Array.from({ length: 12 }, (_, i) =>
        part(`棚${i + 1}`, String(100 + ((i * 131) % 780)), String(80 + ((i * 71) % 600)), 10, i % 2 === 0),
      )
      const t = performance.now()
      hint(job)
      expect(performance.now() - t).toBeLessThan(1000)
    }
  })
})
