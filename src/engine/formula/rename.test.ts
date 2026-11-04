import { describe, expect, it } from 'vitest'
import { MELAMINE_ID, legacyShelfJob as shelfJob } from '../fixtures/shelf'
import { renamePart, renameRefsInExpr } from './rename'

describe('renameRefsInExpr（式の中の参照のつけ替え）', () => {
  it('天板.W - 20 は「天板」を「天板A」に変えると 天板A.W - 20', () => {
    expect(renameRefsInExpr('天板.W - 20', '天板', '天板A')).toBe('天板A.W - 20')
  })

  it('旧名.X を 新名.X に書き換える（W・H とも）', () => {
    expect(renameRefsInExpr('全体.W - 側板.W * 2 + 側板.H', '側板', '側板L')).toBe('全体.W - 側板L.W * 2 + 側板L.H')
  })

  it('空白の有無など、ほかの部分はそのまま残す', () => {
    expect(renameRefsInExpr('(側板.W*2)+  10', '側板', '側')).toBe('(側.W*2)+  10')
  })

  it('名前の一部だけが同じ部材は書き換えない', () => {
    expect(renameRefsInExpr('側板2.W + 左側板.W + 側板.W', '側板', 'X')).toBe('側板2.W + 左側板.W + X.W')
  })

  it('読めない式でも、参照の部分だけ書き換える', () => {
    expect(renameRefsInExpr('側板.W + @', '側板', 'X')).toBe('X.W + @')
  })

  it('W・H 以外（側板.D）は参照ではないので書き換えない', () => {
    expect(renameRefsInExpr('側板.D + 側板.H', '側板', 'X')).toBe('側板.D + X.H')
  })

  it('全角・半角だけが違う旧名（棚板１ と 棚板1）も書き換える', () => {
    expect(renameRefsInExpr('棚板１.W + 1', '棚板1', '棚板A')).toBe('棚板A.W + 1')
  })
})

describe('renameRefsInExpr：調整寸法はつけ替えない', () => {
  it('部材名を変えても {n:adjust-melamine} は変わらない', () => {
    expect(renameRefsInExpr(`天板.H - {n:${MELAMINE_ID}}`, '天板', '天板A')).toBe(`天板A.H - {n:${MELAMINE_ID}}`)
  })
  it('id が部材名と同じ形でも {…} の中は書き換えない', () => {
    expect(renameRefsInExpr('{n:側板.W} + 側板.W', '側板', 'X')).toBe('{n:側板.W} + X.W')
  })
})

describe('renamePart（部材名の変更と参照のつけ替え）', () => {
  it('見本で「天板」を「天板A」に変えると、棚板の式が書き換わる', () => {
    const r = renamePart(shelfJob().parts, 'part-tenita', '天板A')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const byName = Object.fromEntries(r.parts.map((p) => [p.name, p.expr]))
    expect(byName['天板A']).toEqual({ W: '全体.W', H: '全体.H' })
    expect(byName['棚板']).toEqual({ W: `天板A.W - 20 - {n:${MELAMINE_ID}}`, H: '天板A.H - 20 × 2' })
  })

  it('見本で「全体」を「外形」に変えると、参照している式がすべて書き換わる', () => {
    const r = renamePart(shelfJob().parts, 'part-zentai', '外形')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const byName = Object.fromEntries(r.parts.map((p) => [p.name, p.expr]))
    expect(byName['外形']).toEqual({ W: '400', H: '1800' })
    expect(byName['天板']).toEqual({ W: '外形.W', H: '外形.H' })
    expect(byName['側板']).toEqual({ W: '外形.W', H: '700' })
    expect(byName['棚板']).toEqual({ W: `天板.W - 20 - {n:${MELAMINE_ID}}`, H: '天板.H - 20 × 2' })
  })

  it('部材名以外（枚数・回転・仕上がりの完了）は変えない', () => {
    const parts = shelfJob().parts
    parts[3].finishedDone = true
    const r = renamePart(parts, 'part-tenita', '天板A')
    expect(r.ok && r.parts[3]).toMatchObject({ quantity: 3, rotatable: false, finishedDone: true })
  })

  it('元の部材の一覧は書き換えない', () => {
    const job = shelfJob()
    renamePart(job.parts, 'part-zentai', '外形')
    expect(job.parts[0].name).toBe('全体')
    expect(job.parts[1].expr.W).toBe('全体.W')
  })

  it('使えない名前・ほかの部材と同じ名前には変えられない', () => {
    const parts = shelfJob().parts
    expect(renamePart(parts, 'part-zentai', '側板').ok).toBe(false)
    expect(renamePart(parts, 'part-zentai', '側板　').ok).toBe(false)
    expect(renamePart(parts, 'part-zentai', '全 体').ok).toBe(false)
    expect(renamePart(parts, 'part-zentai', '全体.W').ok).toBe(false)
    // 空の名前には変えられる（第1.1版）
    expect(renamePart(parts, 'part-zentai', '').ok).toBe(true)
  })

  it('全角・半角だけが違うほかの部材の名前には変えられない', () => {
    const parts = shelfJob().parts
    parts[3].name = '棚板1'
    expect(renamePart(parts, 'part-zentai', '棚板１').ok).toBe(false)
  })

  it('長音 ー を含む名前に変えられる', () => {
    const r = renamePart(shelfJob().parts, 'part-tenita', 'カウンター')
    expect(r.ok && r.parts[3].expr.H).toBe('カウンター.H - 20 × 2')
  })

  it('同じ名前のままなら何も変わらない', () => {
    const parts = shelfJob().parts
    const r = renamePart(parts, 'part-zentai', '全体')
    expect(r.ok && r.parts).toEqual(parts)
  })

  it('存在しない部材の id はエラー', () => {
    expect(renamePart(shelfJob().parts, 'nope', 'X').ok).toBe(false)
  })
})

describe('全角で書いた参照のつけ替え', () => {
  it('側板．Ｗ も書き換える（ほかの部分は入力したまま）', () => {
    expect(renameRefsInExpr('側板．Ｗ　＋　１０', '側板', '側')).toBe('側.W　＋　１０')
  })
})

describe('renameRefsInExpr：先頭の「＝」はそのまま残す（仕様書 20.2）', () => {
  it('＝天板.W - 20 → ＝天板A.W - 20', () => {
    expect(renameRefsInExpr('＝天板.W - 20', '天板', '天板A')).toBe('＝天板A.W - 20')
  })
})
