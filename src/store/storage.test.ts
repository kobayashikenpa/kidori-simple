import { describe, expect, it } from 'vitest'
import { legacyShelfJob, shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
import type { AppData } from '../engine/types'
import {
  BEFORE_NUMBERS_KEY_PREFIX,
  BROKEN_KEY_PREFIX,
  CURRENT_JOB_KEY,
  DATA_KEY,
  loadSaved,
  parseAppData,
  saveSaved,
  type KeyValueStorage,
} from './storage'

class MemoryStorage implements KeyValueStorage {
  map = new Map<string, string>()
  failWrite = false
  failRead = false
  getItem(key: string) {
    if (this.failRead) throw new Error('read')
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error('quota')
    this.map.set(key, value)
  }
}

const NOW = new Date('2026-10-21T09:00:00.000Z')
const ids = () => {
  let n = 0
  return (p: string) => `${p}-${++n}`
}
const sample = (): AppData => ({ version: 1, jobs: [shelfJob()], adjusts: shelfAdjusts(), cellClip: null, adjustClip: null })

describe('キー', () => {
  it('すべて kidori-simple. で始まる', () => {
    for (const k of [DATA_KEY, CURRENT_JOB_KEY, BROKEN_KEY_PREFIX, BEFORE_NUMBERS_KEY_PREFIX]) expect(k.startsWith('kidori-simple.')).toBe(true)
    expect(DATA_KEY).toBe('kidori-simple.data.v1')
    expect(CURRENT_JOB_KEY).toBe('kidori-simple.currentJobId')
  })
})

describe('保存と読み込み', () => {
  it('何も無ければ初めの状態（仕事なし・メラミン1・シート0.5）', () => {
    const r = loadSaved(new MemoryStorage(), ids(), NOW)
    expect(r.status).toBe('empty')
    expect(r.data.jobs).toEqual([])
    expect(r.data.adjusts.map((a) => [a.name, a.value])).toEqual([
      ['メラミン', 1],
      ['シート', 0.5],
    ])
    expect(r.canSave).toBe(true)
  })

  it('書いたものを読み戻せる。開いていた仕事も戻る', () => {
    const st = new MemoryStorage()
    expect(saveSaved(st, sample(), 'job-shelf')).toEqual({ ok: true })
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data).toEqual(sample())
    expect(r.currentJobId).toBe('job-shelf')
  })

  it('第1版の保存データ（名前も枚数も入っている）をそのまま読める', () => {
    // 第1版の形のまま文字で書いた保存データ
    const v1 = JSON.stringify({
      version: 1,
      jobs: [
        {
          id: 'job-1',
          name: '本棚',
          settings: { sheet: { sizeKind: 'shihachi', width: 1220, length: 2430 }, kerf: 3, trim: 5, allowance: 10, cutMode: 'vertical' },
          parts: [
            { id: 'p1', name: '全体', expr: { W: '400', H: '1800' }, quantity: 0, rotatable: false, finishedDone: false },
            { id: 'p2', name: '天板', expr: { W: '全体.W', H: '全体.H' }, quantity: 1, rotatable: false, finishedDone: true },
          ],
          frozenSheets: [],
          createdAt: '2026-10-21T00:00:00.000Z',
          updatedAt: '2026-10-21T00:00:00.000Z',
        },
      ],
      adjusts: [{ id: 'a1', name: 'メラミン', value: 1 }],
      clipboard: [{ name: '棚板', expr: { W: '300', H: '400' }, quantity: 2, rotatable: true }],
    })
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, v1)
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    // 第1.1版までの「コピーした部材」（clipboard）は読んで捨て、コピーしたセルは無し（第1.2版）。履歴は空（第2.1版）。
    // 式（全体.W・全体.H）は仕上がり寸法の数字に置き換える（第2.2版。仕様書 26.4）
    const { clipboard: _old, ...rest } = JSON.parse(v1) as { jobs: { parts: { expr: unknown }[] }[] } & Record<string, unknown>
    rest.jobs[0].parts[1].expr = { W: '400', H: '1800' }
    expect(r.data).toEqual({ ...rest, jobs: rest.jobs.map((j) => ({ ...j, history: [] })), cellClip: null, adjustClip: null })
    expect(r.numbering).toEqual({ replaced: true, cleared: [] })
    expect('clipboard' in r.data).toBe(false)
  })

  it('第2.0版までの保存データ（仕事に履歴が無い）は、空の履歴にして読む。ほかの中身は変わらない（第2.1版）', () => {
    const data = sample()
    const old = JSON.parse(JSON.stringify(data)) as { jobs: Record<string, unknown>[] }
    for (const j of old.jobs) delete j.history
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(old))
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data).toEqual(data)
    expect(r.data.jobs[0].history).toEqual([])
    // 読んだだけでは元のデータを書き換えない
    expect(st.getItem(DATA_KEY)).toBe(JSON.stringify(old))
  })

  it('履歴（第2.1版）を保存して読み戻せる', () => {
    const data = sample()
    data.jobs[0].history = [
      {
        id: 'h-2',
        savedAt: '2026-11-04T10:00:00.000Z',
        memo: '',
        settings: { ...data.jobs[0].settings, sheet: { sizeKind: 'custom', width: 600, length: 1800 }, cutMode: 'horizontal' },
        parts: [{ name: '', expr: { W: '300', H: '400' }, quantity: null, rotatable: true, finishedDone: true }],
        sheetCount: 0,
        yieldRate: 0,
      },
      {
        id: 'h-1',
        savedAt: '2026-11-04T09:00:00.000Z',
        memo: '初めの案',
        settings: data.jobs[0].settings,
        parts: data.jobs[0].parts.map(({ id: _id, ...p }) => p),
        sheetCount: 2,
        yieldRate: 0.572,
      },
    ]
    const st = new MemoryStorage()
    saveSaved(st, data, null)
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data).toEqual(data)
  })

  it('第1.3版までの切り方「おまかせ」（auto）は縦切り優先にして読む（仕様書 18.2）', () => {
    const old = { ...sample(), jobs: [{ ...shelfJob(), settings: { ...shelfJob().settings, cutMode: 'auto' } }, shelfJob('job-h')] }
    old.jobs[1].settings.cutMode = 'horizontal'
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(old))
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data.jobs.map((j) => j.settings.cutMode)).toEqual(['vertical', 'horizontal'])
    expect(r.data.jobs[0]).toEqual({ ...shelfJob(), settings: { ...shelfJob().settings, cutMode: 'vertical' } })
  })

  it('切り方が縦切り優先・横切り優先・おまかせのどれでもなければ読めない', () => {
    const bad = { ...sample(), jobs: [{ ...shelfJob(), settings: { ...shelfJob().settings, cutMode: 'diagonal' } }] }
    expect(parseAppData(JSON.parse(JSON.stringify(bad)))).toBeNull()
  })

  it('第1.1版の保存データ（名前・枚数が空・コピーした部材が空）も読める', () => {
    const data = { ...sample(), clipboard: null } as Record<string, unknown>
    delete data.cellClip
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(data))
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data).toEqual(sample())
  })

  it('コピーしたセル（第1.2版）を保存して読み戻せる。形が違うコピーは捨てて、仕事は読める', () => {
    const data = sample()
    data.cellClip = { rows: 2, cols: 2, cells: [['棚板', '380'], ['', '3']] }
    const st = new MemoryStorage()
    saveSaved(st, data, null)
    expect(loadSaved(st, ids(), NOW).data).toEqual(data)
    for (const bad of [{ rows: 2, cols: 1, cells: [['1']] }, { rows: 1, cols: 5, cells: [['', '', '', '', '']] }, { rows: 1, cols: 1, cells: [[3]] }, 'x']) {
      st.setItem(DATA_KEY, JSON.stringify({ ...data, cellClip: bad }))
      const r = loadSaved(st, ids(), NOW)
      expect(r.status).toBe('ok')
      expect(r.data).toEqual({ ...data, cellClip: null, adjustClip: null })
    }
  })

  it('切り取りの元が付いたコピー（第1.3版）を保存して読み戻せる。第1.2版の形（元なし）も読める', () => {
    const data = sample()
    data.cellClip = { rows: 1, cols: 2, cells: [['棚板', '3']], cut: { jobId: 'job-shelf', range: { top: 3, left: 2, rows: 1, cols: 2 } } }
    const st = new MemoryStorage()
    saveSaved(st, data, null)
    expect(loadSaved(st, ids(), NOW).data).toEqual(data)
    const v12 = { rows: 1, cols: 1, cells: [['400']] }
    st.setItem(DATA_KEY, JSON.stringify({ ...data, cellClip: v12 }))
    expect(loadSaved(st, ids(), NOW).data.cellClip).toEqual(v12)
  })

  it('切り取りの元の形だけが違うときは、元を外してふつうのコピーとして読む', () => {
    const data = sample()
    const clip = { rows: 1, cols: 2, cells: [['棚板', '3']] }
    const st = new MemoryStorage()
    for (const badCut of [
      'x',
      { jobId: 1, range: { top: 0, left: 0, rows: 1, cols: 2 } },
      { jobId: 'job-shelf', range: { top: 0, left: 3, rows: 1, cols: 2 } },
      { jobId: 'job-shelf', range: { top: 0, left: 0, rows: 2, cols: 2 } },
      { jobId: 'job-shelf', range: { top: -1, left: 0, rows: 1, cols: 2 } },
    ]) {
      st.setItem(DATA_KEY, JSON.stringify({ ...data, cellClip: { ...clip, cut: badCut } }))
      const r = loadSaved(st, ids(), NOW)
      expect(r.status).toBe('ok')
      expect(r.data.cellClip).toEqual(clip)
    }
  })

  it('名前が空・枚数が空（null）の部材も保存して読み戻せる（第1.1版）', () => {
    const data = sample()
    data.jobs[0].parts.push(
      { id: 'p5', name: '', expr: { W: '300', H: '400' }, quantity: null, rotatable: false, finishedDone: false },
      { id: 'p6', name: '', expr: { W: '300', H: '400' }, quantity: 1, rotatable: false, finishedDone: false },
    )
    const st = new MemoryStorage()
    saveSaved(st, data, null)
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data).toEqual(data)
  })

  it('開いていた仕事が無ければ開いていない状態', () => {
    const st = new MemoryStorage()
    saveSaved(st, sample(), null)
    expect(loadSaved(st, ids(), NOW).currentJobId).toBeNull()
    st.setItem(CURRENT_JOB_KEY, 'nope')
    expect(loadSaved(st, ids(), NOW).currentJobId).toBeNull()
  })

  it('kidori のキーには触らない', () => {
    const st = new MemoryStorage()
    st.setItem('kidori.jobs.v3', 'kidori のデータ')
    saveSaved(st, sample(), 'job-shelf')
    expect(st.getItem('kidori.jobs.v3')).toBe('kidori のデータ')
    expect([...st.map.keys()].filter((k) => !k.startsWith('kidori-simple.'))).toEqual(['kidori.jobs.v3'])
  })

  it('書けなくても例外を出さず理由を返す', () => {
    const st = new MemoryStorage()
    st.failWrite = true
    const r = saveSaved(st, sample(), null)
    expect(r.ok).toBe(false)
    expect(saveSaved(null, sample(), null).ok).toBe(false)
  })
})

describe('壊れた保存データ', () => {
  it.each([
    ['JSON でない', '{こわれた'],
    ['形が違う', JSON.stringify({ version: 1, jobs: 'x', adjusts: [], cellClip: null, adjustClip: null })],
    ['版が違う', JSON.stringify({ ...sample(), version: 2 })],
    ['部材の枚数がおかしい', JSON.stringify({ ...sample(), jobs: [{ ...shelfJob(), parts: [{ ...shelfJob().parts[0], quantity: -1 }] }] })],
    ['部材の枚数が文字', JSON.stringify({ ...sample(), jobs: [{ ...shelfJob(), parts: [{ ...shelfJob().parts[0], quantity: '1' }] }] })],
    ['部材の枚数が無い', JSON.stringify({ ...sample(), jobs: [{ ...shelfJob(), parts: [{ ...shelfJob().parts[0], quantity: undefined }] }] })],
    ['調整寸法が 0', JSON.stringify({ ...sample(), adjusts: [{ id: 'a', name: '逃げ', value: 0 }] })],
    ['履歴が並びでない', JSON.stringify({ ...sample(), jobs: [{ ...shelfJob(), history: 'x' }] })],
    ['履歴の部材の枚数がおかしい', JSON.stringify({ ...sample(), jobs: [{ ...shelfJob(), history: [{ id: 'h', savedAt: 't', memo: '', settings: shelfJob().settings, parts: [{ name: 'a', expr: { W: '1', H: '1' }, quantity: -1, rotatable: false, finishedDone: false }], sheetCount: 1, yieldRate: 0.5 }] }] })],
    ['履歴の id が重なる', JSON.stringify({ ...sample(), jobs: [{ ...shelfJob(), history: [1, 2].map(() => ({ id: 'h', savedAt: 't', memo: '', settings: shelfJob().settings, parts: [], sheetCount: 0, yieldRate: 0 })) }] })],
  ])('%s：空の一覧で始め「保存データを読めませんでした」。元のデータは書き換えず、控えに残す', (_label, raw) => {
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, raw)
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('error')
    expect(r.data.jobs).toEqual([])
    expect(r.message).toMatch(/^保存データを読めませんでした/)
    expect(st.getItem(DATA_KEY)).toBe(raw)
    expect(st.getItem(`${BROKEN_KEY_PREFIX}.${NOW.toISOString()}`)).toBe(raw)
    expect(r.canSave).toBe(true)
  })

  it('控えに残せなければ、このあと保存しない（canSave: false）', () => {
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, '{こわれた')
    st.failWrite = true
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('error')
    expect(r.canSave).toBe(false)
    expect(st.getItem(DATA_KEY)).toBe('{こわれた')
  })

  it('同じ時刻の控えがあっても上書きしない', () => {
    const st = new MemoryStorage()
    st.setItem(`${BROKEN_KEY_PREFIX}.${NOW.toISOString()}`, '前の控え')
    st.setItem(DATA_KEY, '{こわれた')
    loadSaved(st, ids(), NOW)
    expect(st.getItem(`${BROKEN_KEY_PREFIX}.${NOW.toISOString()}`)).toBe('前の控え')
    expect(st.getItem(`${BROKEN_KEY_PREFIX}.${NOW.toISOString()}.1`)).toBe('{こわれた')
  })

  it('読めない（例外）・localStorage が無いときも画面は始められる。保存はしない', () => {
    const st = new MemoryStorage()
    st.failRead = true
    const r = loadSaved(st, ids(), NOW)
    expect(r).toMatchObject({ status: 'error', canSave: false })
    expect(r.data.jobs).toEqual([])
    expect(loadSaved(null, ids(), NOW)).toMatchObject({ status: 'error', canSave: false })
  })

  it('同じ id の仕事が2つあれば読めないとする', () => {
    expect(parseAppData({ ...sample(), jobs: [shelfJob(), shelfJob()] })).toBeNull()
  })
})

describe('前のデータの式を数字に置き換える（第2.2版。仕様書 26.4）', () => {
  /** 第2.1版の保存データ（見本の棚が式・調整寸法の一覧つき） */
  const legacy = () => ({ ...sample(), jobs: [legacyShelfJob()] })

  it('開いたときに式を仕上がり寸法の数字にし、置き換えたことを返す（エラーで空にしたものは無し）', () => {
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(legacy()))
    st.setItem(CURRENT_JOB_KEY, 'job-shelf')
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data.jobs[0].parts).toEqual(shelfJob().parts)
    expect(r.numbering).toEqual({ replaced: true, cleared: [] })
    expect(r.currentJobId).toBe('job-shelf')
    expect(r.canSave).toBe(true)
  })

  it('置き換える前の保存データを控えに1つ残し、置き換えたデータを保存し直す（次に開いたときは知らせない）', () => {
    const st = new MemoryStorage()
    const raw = JSON.stringify(legacy())
    st.setItem(DATA_KEY, raw)
    loadSaved(st, ids(), NOW)
    const backups = [...st.map.keys()].filter((k) => k.startsWith(BEFORE_NUMBERS_KEY_PREFIX))
    expect(backups).toEqual([`${BEFORE_NUMBERS_KEY_PREFIX}.${NOW.toISOString()}`])
    expect(st.getItem(backups[0])).toBe(raw)
    expect(JSON.parse(st.getItem(DATA_KEY)!).jobs[0].parts).toEqual(shelfJob().parts)
    const again = loadSaved(st, ids(), NOW)
    expect(again.numbering).toEqual({ replaced: false, cleared: [] })
    expect([...st.map.keys()].filter((k) => k.startsWith(BEFORE_NUMBERS_KEY_PREFIX))).toHaveLength(1)
  })

  it('同じ時刻の控えがあっても上書きしない', () => {
    const st = new MemoryStorage()
    st.setItem(`${BEFORE_NUMBERS_KEY_PREFIX}.${NOW.toISOString()}`, '前の控え')
    st.setItem(DATA_KEY, JSON.stringify(legacy()))
    loadSaved(st, ids(), NOW)
    expect(st.getItem(`${BEFORE_NUMBERS_KEY_PREFIX}.${NOW.toISOString()}`)).toBe('前の控え')
    expect(st.getItem(`${BEFORE_NUMBERS_KEY_PREFIX}.${NOW.toISOString()}.1`)).not.toBeNull()
  })

  it('控えに残せなければ、置き換えた中身で始めるが、元のデータは書き換えず このあと保存しない', () => {
    const st = new MemoryStorage()
    const raw = JSON.stringify(legacy())
    st.setItem(DATA_KEY, raw)
    st.failWrite = true
    const r = loadSaved(st, ids(), NOW)
    expect(r.status).toBe('ok')
    expect(r.data.jobs[0].parts).toEqual(shelfJob().parts)
    expect(r.canSave).toBe(false)
    expect(r.message).toMatch(/控えを残せなかった/)
    expect(st.getItem(DATA_KEY)).toBe(raw)
  })

  it('エラーの式は空にして、仕事名・部材名・W/H を返す。履歴の中も置き換える', () => {
    const data = legacy()
    data.jobs[0].parts.push({ id: 'p5', name: '扉', expr: { W: '地板.W', H: '600' }, quantity: 1, rotatable: false, finishedDone: false })
    data.jobs[0].history = [
      { id: 'h1', savedAt: 't', memo: 'メモ', settings: data.jobs[0].settings, parts: legacyShelfJob().parts.map(({ id: _id, ...p }) => p), sheetCount: 2, yieldRate: 0.5 },
    ]
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(data))
    const r = loadSaved(st, ids(), NOW)
    expect(r.data.jobs[0].parts[4].expr).toEqual({ W: '', H: '600' })
    expect(r.data.jobs[0].history[0].parts.map((p) => p.expr)).toEqual(shelfJob().parts.map((p) => p.expr))
    expect(r.numbering).toEqual({ replaced: true, cleared: [{ jobId: 'job-shelf', jobName: '棚', partName: '扉', axis: 'W' }] })
  })

  it('調整寸法は保存データの中の一覧で計算する（メラミン2 なら棚板 W は 378）', () => {
    const data = { ...legacy(), adjusts: [{ id: 'adjust-melamine', name: 'メラミン', value: 2 }] }
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify(data))
    expect(loadSaved(st, ids(), NOW).data.jobs[0].parts[3].expr.W).toBe('378')
  })

  it('式の入ったアプリ内のコピー（セル）は捨てる。数字・名前だけのコピーは残す', () => {
    const st = new MemoryStorage()
    st.setItem(DATA_KEY, JSON.stringify({ ...sample(), cellClip: { rows: 1, cols: 2, cells: [['棚板', '天板.W - 20']] } }))
    expect(loadSaved(st, ids(), NOW).data.cellClip).toBeNull()
    const keep = { rows: 1, cols: 2, cells: [['棚板', '379']] }
    st.setItem(DATA_KEY, JSON.stringify({ ...sample(), cellClip: keep }))
    expect(loadSaved(st, ids(), NOW).data.cellClip).toEqual(keep)
  })

  it('式が無い保存データは置き換えず、控えも作らず、書き直さない', () => {
    const st = new MemoryStorage()
    const raw = JSON.stringify(sample())
    st.setItem(DATA_KEY, raw)
    const r = loadSaved(st, ids(), NOW)
    expect(r.numbering).toEqual({ replaced: false, cleared: [] })
    expect([...st.map.keys()].some((k) => k.startsWith(BEFORE_NUMBERS_KEY_PREFIX))).toBe(false)
    expect(st.getItem(DATA_KEY)).toBe(raw)
  })

  it('parseAppData も置き換えたデータを返す', () => {
    expect(parseAppData(JSON.parse(JSON.stringify(legacy())))?.jobs[0].parts).toEqual(shelfJob().parts)
  })
})
