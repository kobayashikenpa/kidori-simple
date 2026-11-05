// 部材の表（仕様書 15.1・15.2・17.1。［仕上がり］のタブ）：番号・名前・W・H・枚数。表の下にいつも空の行。
// セルを1回押すと選ぶ（太い枠）、選んでいるセルをもう一度押すと入力（第1.3版）。角の丸い取っ手を引くと範囲が広がる。
// 番号を押すと行全体、見出しを押すと列全体を選ぶ。範囲は engine の CellRange（left 0＝名前 … 3＝枚数）で持つ。
// セル（範囲）を長押しするとメニュー（CellMenu。仕様書 17.2）。右下の四角い取っ手を上下に引くとオートフィル（仕様書 17.4）。
// 表の上に、今コピーしているもの と 操作のあとの知らせ を短く出す。
// 名前はその場でスマホのキーボード。W・H・枚数はスマホのキーボードを出さず、画面の下のアプリのキー（PadKeys）で入れる。
// 入力はキーを押すたびに保存する。空の行に入れたときに部材を作り、何も入っていない部材は表から外す（保存しない）。
// 寸法の計算は engine（computeDimensions の結果を受け取る）。W・H の数字の編集は sizeEdit.ts、枚数は numpad.ts
// 選ぶ・取っ手・長押しの指の動きは useGrid。
// 第2.2版（仕様書 26）：W・H は数字だけ。式・調整寸法の表・「＝」でセルを押して寸法を入れる動き・式の隣の計算した寸法はなくした
// 第2.3版（仕様書 27）：W・H に数字と ＋ − × ÷ ( ) だけの式を入れられる（キーは PadKeys、編集は sizeEdit.ts、計算は engine）。
// 式の入ったセルの右上に ƒ。
// 第2.4版（仕様書 28）：選んだセルの中身だけ（式なら 450−50）を出す欄（式の欄。ƒx の印は付けない）を、画面の下（下のタブのすぐ上）に1つだけ置く。
// 幅・長さ・枚数のセルを選んでいる間だけ出し、欄を押すか選んでいるセルをもう一度押すと、その欄で入力（カーソル・アプリのキーは欄のすぐ下・✓ で終える）。
// 第2.3版の「表の上の欄」と「キーの上の行」はこの欄にまとめた（2重に出さない）
// 画面では W を「幅」、H を「長さ」と出す（保存データの中は W・H のまま）
// 第2.0版（仕様書 24）：見出しを長押しすると並べ替えのメニュー（大きい順・小さい順／あいうえお順・逆の順。並べ替えは engine の sortParts）。
// 選んでいる行の番号を上下に引くと、その行を動かす（engine の moveParts。指の動きは useGrid）
import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { columnRange, rowRange } from '../../engine/clipboard/cells'
import { movedTop, type SortKey, type SortOrder } from '../../engine/order'
import { hasName } from '../../engine/parts'
import { isSizeFormula, sizeLabel } from '../../engine/size'
import { CELL_COLS, type Axis, type CellClip, type CellRange, type DimensionResult, type Job, type Part } from '../../engine/types'
import { currentJob, type ReduceResult, type StoreAction } from '../../store/reducer'
import { CELL_COL_LABEL, clampRange, clipText, fillExtension, fillHint, fillText, isSingleAt, rangeEnd, rangeHas, rangeText, singleRange } from '../cellSelect'
import { claimOpen } from '../exclusive'
import { fmt } from '../format'
import { closeKeyboard } from '../keyboard'
import { pressKey } from '../numpad'
import {
  addRowsMin,
  cellBarText,
  fxBarField,
  inputRow,
  isBlankPart,
  nextCell,
  quantityFromText,
  quantityText,
  sessionTableMinRows,
  setSessionTableMinRows,
  errorsWhileEditing,
  tableDimCell,
  tableRowCount,
  type TableCell,
  type TableField,
} from '../partsTable'
import { pressSizeKey, type SizeKey } from '../sizeEdit'
import { useLongPress } from '../useLongPress'
import { rangeKey, useOutsideEnd, usePadHeight, useRevealRow, useGrid, useGridBoxes, type MovableRows, type PressAt } from '../useGrid'
import { CellMenu } from './CellMenu'
import { GridOverlay } from './GridOverlay'
import { PadKeys } from './PadKeys'
import { Sheet } from './Sheet'

interface Props {
  job: Job
  dims: DimensionResult
  /** 今コピー（切り取り）しているセル（アプリ全体で1つ） */
  clip: CellClip | null
  dispatch: (action: StoreAction) => ReduceResult
  onError: (message: string | null) => void
  ref?: Ref<PartsTableHandle>
}

/** 表の外から使う操作 */
export interface PartsTableHandle {
  /** その部材の名前の欄を選び、スマホのキーボードを出す（押した操作の中で呼ぶ）。job は操作のあとの仕事 */
  editName: (job: Job, partId: string) => void
}

/** 選んでいる欄（部材の id と欄）。partId が null なら いちばん上の空の行 */
interface Sel {
  partId: string | null
  field: TableField
}

/** 選んでいる欄の行の番号（部材が無くなっていれば null） */
function cellOf(s: Sel | null, parts: readonly Part[]): TableCell | null {
  if (!s) return null
  if (s.partId === null) return { row: parts.length, field: s.field }
  const row = parts.findIndex((p) => p.id === s.partId)
  return row < 0 ? null : { row, field: s.field }
}

/** 欄の画面の名前（第2.3版 仕様書 27.5：W は「幅」、H は「長さ」） */
const FIELD_LABEL: Record<TableField, string> = CELL_COL_LABEL

/** 幅・長さが板のどちらの辺か（仕様書 18.4・27.5。回転しない部材は 幅 を妻手・長さ を長手に合わせて置く） */

/** 見出し・並べ替えのメニューの名前：「幅」「長さ」「名前」「枚数」（仕様書 27.5。妻手・長手は添えない） */
const fieldTitle = (f: TableField): string => FIELD_LABEL[f]

/** 欄の列の位置（0＝名前 … 3＝枚数） */
const colOf = (f: TableField): number => CELL_COLS.indexOf(f)

/** 見出しの列 → 並べ替えに使う列（engine の SortKey） */
const SORT_KEY: Record<TableField, SortKey> = { name: 'name', W: 'W', H: 'H', qty: 'qty' }

/** 並べ替えのメニューのボタン（仕様書 24.1）：幅・長さ・枚数は大きい順・小さい順、名前はあいうえお順・逆の順 */
function sortChoices(f: TableField): { order: SortOrder; label: string }[] {
  return f === 'name'
    ? [
        { order: 'asc', label: 'あいうえお順' },
        { order: 'desc', label: '逆の順' },
      ]
    : [
        { order: 'desc', label: '大きい順' },
        { order: 'asc', label: '小さい順' },
      ]
}

export function PartsTable({ job, dims, clip, dispatch, onError, ref }: Props) {
  const parts = job.parts
  // 「＋ 5行足す」で増やした行の数の下限（アプリを開いている間だけ、仕事ごとに覚える。保存しない）
  const [minRows, setMinRows] = useState(() => sessionTableMinRows(job.id))
  const [minRowsJob, setMinRowsJob] = useState(job.id)
  // 長押しのメニューを開いているか・操作のあとの知らせ（表の上に短く出す）
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // 見出しを長押しして開いた並べ替えのメニューの列（仕様書 24.1。開いていなければ null）
  const [sortCol, setSortCol] = useState<number | null>(null)
  if (minRowsJob !== job.id) {
    setMinRowsJob(job.id)
    setMinRows(sessionTableMinRows(job.id))
    setMenuOpen(false)
    setSortCol(null)
    setNotice(null)
  }
  const rowCount = tableRowCount(parts.length, minRows)
  const addRows = () => {
    const next = addRowsMin(parts.length, minRows)
    setSessionTableMinRows(job.id, next)
    setMinRows(next)
  }
  // 選んでいる欄。部材の id で持つ（行の番号は、部材を外すとずれるため）。partId が null なら いちばん上の空の行
  const [selS, setSelS] = useState<Sel | null>(null)
  const sel = cellOf(selS, parts)
  const selKey = sel ? `${sel.row}:${sel.field}` : ''
  // W・H の数字のカーソル（文字の位置。◀ ▶ で動く）。同じ操作の中で続けて使えるよう手元にも持つ
  const [cursor, setCursorS] = useState(0)
  const cursorRef = useRef(0)
  const setCursor = (c: number) => {
    cursorRef.current = c
    setCursorS(c)
  }
  // 名前の欄の書きかけ（確定するまで保存しない）
  const [nameDraft, setNameDraft] = useState('')
  const nameDraftRef = useRef('')
  const setDraft = (t: string) => {
    nameDraftRef.current = t
    setNameDraft(t)
  }
  // 名前を保存できなかった理由（行の下に出す）
  const [nameMsg, setNameMsg] = useState<string | null>(null)
  const nameErrorRef = useRef<string | null>(null)

  // 同じ操作の中で続けて使えるよう、最新の仕事と選んでいる欄を手元にも持つ
  const jobRef = useRef(job)
  const selSRef = useRef(selS)
  useEffect(() => {
    jobRef.current = job
    selSRef.current = selS
  })
  const tableRef = useRef<HTMLDivElement>(null)
  // 画面の下の 式の欄とアプリのキーをまとめた入れ物（入力していないときは欄だけ）
  const dockRef = useRef<HTMLDivElement>(null)
  const nameInputs = useRef(new Map<number, HTMLInputElement>())
  const rowEls = useRef(new Map<number, HTMLDivElement>())
  const headEls = useRef<(HTMLButtonElement | null)[]>([])

  // 選んでいる範囲・取っ手・長押し（useGrid）
  const grid = useGrid({
    tableRef,
    rowEls,
    headEls,
    rowCount,
    colCount: CELL_COLS.length,
    onPressCell: (row, col) => pressCell(row, CELL_COLS[col]),
    onPressRow: (row) => pressRow(row),
    onLongPress: (at) => openMenu(at),
    onFill: (from, to) => fillDone(from, to),
    onFillStart: () => onError(null),
    // ほかの表が範囲を選んだら、こちらの入力は終える
    onRelease: () => {
      if (curCell()) selectRef.current(null)
    },
    // 仕事を切り替えたら、選んでいる範囲を外す
    resetKey: job.id,
    // 選んでいる行の番号を引くと、その行を動かす（仕様書 24.2）
    moveRowsFrom: (row) => movableRows(row),
    onMoveRows: (top, rows, to) => moveDone(top, rows, to),
  })
  const { range, active, rangeRef, activeRef, selectRange, dragging, fillTo, moving, moveLine } = grid

  const setSel = (s: Sel | null) => {
    selSRef.current = s
    setSelS(s)
  }
  const curCell = () => cellOf(selSRef.current, jobRef.current.parts)

  const run = (action: StoreAction): ReduceResult => {
    const r = dispatch(action)
    if (r.ok) jobRef.current = currentJob(r.state) ?? jobRef.current
    else onError(r.message)
    return r
  }

  /** 空の行に入れたとき：部材を作り、選んでいる欄をその部材にする */
  const addFromEmpty = (part: Partial<Omit<Part, 'id'>>): boolean => {
    const r = run({ type: 'addPart', part: { name: '', expr: { W: '', H: '' }, quantity: null, ...part } })
    if (!r.ok || !r.id) return false
    const cur = selSRef.current
    if (cur && cur.partId === null) setSel({ partId: r.id, field: cur.field })
    return true
  }

  // ---------- 名前 ----------

  /** 名前を確定して保存する。保存できたら true（空の行なら部材を作る。空の名前のままなら何もしない） */
  const commitName = (row: number, draft: string): boolean => {
    const name = draft.trim()
    const part = jobRef.current.parts[row]
    if (!part) {
      if (name === '') return true
      const r = dispatch({ type: 'addPart', part: { name, expr: { W: '', H: '' }, quantity: null } })
      if (!r.ok) return nameFailed(r.message)
      jobRef.current = currentJob(r.state) ?? jobRef.current
      const cur = selSRef.current
      if (cur && cur.partId === null && r.id) setSel({ partId: r.id, field: cur.field })
    } else if (name !== part.name) {
      const r = dispatch({ type: 'updatePart', partId: part.id, patch: { name } })
      if (!r.ok) return nameFailed(r.message)
      jobRef.current = currentJob(r.state) ?? jobRef.current
    }
    setNameMsg(null)
    return true
  }
  const nameFailed = (message: string): false => {
    nameErrorRef.current = message
    setNameMsg(message)
    return false
  }

  const selectCell = (cell: TableCell | null) => {
    const prev = curCell()
    if (prev && cell && prev.row === cell.row && prev.field === cell.field) return
    setNameMsg(null)
    onError(null)
    // 名前の欄から離れるときは、書きかけの名前を確定する（保存できなければ元に戻して理由を出す）
    if (prev?.field === 'name' && !commitName(prev.row, nameDraftRef.current)) {
      onError(`${nameErrorRef.current ?? '名前を保存できませんでした'}。名前は元に戻しました`)
    }
    if (!cell) {
      setSel(null)
      return
    }
    const ps = jobRef.current.parts
    const row = inputRow(cell.row, ps.length)
    const part = ps[row]
    setSel({ partId: part?.id ?? null, field: cell.field })
    // 入力しているセルを選ぶ（「次へ」で進むと、選ぶ枠も一緒に動く）
    selectRange(singleRange({ row, col: colOf(cell.field) }))
    if (cell.field === 'name') {
      setDraft(part?.name ?? '')
      return
    }
    // アプリのキーを出すときは、スマホのキーボードをしまう
    closeKeyboard()
    // W・H は数字の終わりにカーソルを置いて開く
    if (cell.field !== 'qty') setCursor((part?.expr[cell.field] ?? '').length)
  }
  const selectRef = useRef(selectCell)

  /** その部材の名前の入力を始める（押した操作の中で呼ぶ）。nextJob は操作のあとの仕事 */
  const editName = (nextJob: Job, partId: string) => {
    jobRef.current = nextJob
    const row = nextJob.parts.findIndex((p) => p.id === partId)
    if (row < 0) return
    // 先に表を描き直して名前の欄を作り、押した操作の中で注目を移す（スマホのキーボードが出るように）
    flushSync(() => {
      setSel({ partId, field: 'name' })
      selectRange(singleRange({ row, col: 0 }))
      setDraft(nextJob.parts[row].name)
      setNameMsg(null)
    })
    nameInputs.current.get(row)?.focus()
  }
  useImperativeHandle(ref, () => ({ editName }))

  /** 長押しのメニューの「行を上に挿入」：index の位置に空の行を入れて、その名前の入力を始める */
  const insertAbove = (index: number) => {
    const r = run({ type: 'insertPart', index, part: { name: '', expr: { W: '', H: '' }, quantity: null } })
    if (!r.ok || !r.id) return
    const next = currentJob(r.state)
    if (next) editName(next, r.id)
  }
  useEffect(() => {
    selectRef.current = selectCell
  })


  // 何も入っていない部材は表から外す（保存しない）。入力している部材と、選んでいる範囲の行の部材（行を上に挿入で足した空の行など）は
  // 外さない（押して選んだり入力したりできるように）。範囲より上の行を外したときは、範囲もその分だけ上にずらす（同じ行を選んだまま）
  const selPartId = selS?.partId ?? null
  const rangeTop = range?.top ?? -1
  const rangeRows = range?.rows ?? 0
  useEffect(() => {
    const blank = parts
      .map((p, i) => ({ p, i }))
      .filter(({ p, i }) => isBlankPart(p) && p.id !== selPartId && !(i >= rangeTop && i < rangeTop + rangeRows))
    if (blank.length === 0) return
    for (const { p } of blank) dispatch({ type: 'removePart', partId: p.id })
    const above = blank.filter(({ i }) => i < rangeTop).length
    const r = rangeRef.current
    const a = activeRef.current
    if (r && above > 0) selectRange({ ...r, top: r.top - above }, a ? { row: a.row - above, col: a.col } : undefined)
  }, [parts, selPartId, rangeTop, rangeRows, dispatch, rangeRef, activeRef, selectRange])

  const padOpen = sel !== null && sel.field !== 'name'
  const anySel = sel !== null

  // 欄を選んでいる間：表とキーの外を押したら閉じる（ほかの表のセルは押したことが決まってから。useOutsideEnd）
  useOutsideEnd(
    anySel,
    (t) => !!tableRef.current?.contains(t) || !!dockRef.current?.contains(t),
    () => selectRef.current(null),
  )
  useEffect(() => {
    if (!padOpen) return
    return claimOpen('pad', () => selectRef.current(null))
  }, [padOpen])

  // 式の欄（第2.4版 仕様書 28.1）：選んでいる範囲の左上が 幅・長さ・枚数 のセルの間だけ出す（入力中はそのセル）
  const barRange = range ? clampRange(range, rowCount) : null
  const barField = sel ? (sel.field === 'name' ? null : sel.field) : fxBarField(barRange)
  const barOn = barField !== null
  // 欄（入力中はキーも）の高さ（表の下に同じだけ余白を足す）と、選んだ・入力している行が欄の上に見えるようにスクロールする。
  // 入力していないときは、1つのセルを選んだときだけ合わせる（列全体などを選んだときは動かさない）
  const dockH = usePadHeight(dockRef, barOn ? `${barField}:${padOpen ? 'pad' : 'bar'}` : null)
  const revealKey = selKey || (barOn && barRange && barRange.rows === 1 && barRange.cols === 1 ? `${barRange.top}:${barField}:bar` : '')
  useRevealRow(rowEls, dockRef, revealKey, dockH)

  const onNameKey = (row: number, e: ReactKeyboardEvent<HTMLInputElement>) => {
    // 日本語の変換を確定する Enter は除く
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    if (!commitName(row, nameDraftRef.current)) return
    // キーボードの「次へ（改行）」：同じ行の W へ（アプリのキーを出す）
    selectCell({ row, field: 'W' })
    e.currentTarget.blur()
  }

  const onNameBlur = (row: number) => {
    const cur = curCell()
    if (!cur || cur.row !== row || cur.field !== 'name') return
    if (!commitName(row, nameDraftRef.current)) {
      // 保存できない名前は元に戻す（理由は出したまま）
      setDraft(jobRef.current.parts[row]?.name ?? '')
      setNameMsg((m) => (m ? `${m}。名前は元に戻しました` : m))
    }
  }

  // ---------- W・H・枚数 ----------

  /** 幅・長さのキーを押したとき：数字か式を変えて保存する（空の行なら部材を作る） */
  const pressSize = (row: number, axis: Axis, key: SizeKey) => {
    const part = jobRef.current.parts[row]
    const e = pressSizeKey(part?.expr[axis] ?? '', cursorRef.current, key)
    setCursor(e.cursor)
    if (!part) {
      if (e.text !== '') addFromEmpty({ expr: { W: '', H: '', [axis]: e.text } })
      return
    }
    if (e.text !== part.expr[axis]) run({ type: 'updatePart', partId: part.id, patch: { expr: { ...part.expr, [axis]: e.text } } })
  }

  const pressQty = (row: number, key: string) => {
    const part = jobRef.current.parts[row]
    const q = quantityFromText(pressKey(quantityText(part?.quantity ?? null), key, false, true))
    if (!part) {
      if (q !== null) addFromEmpty({ quantity: q })
      return
    }
    if (q !== part.quantity) run({ type: 'updatePart', partId: part.id, patch: { quantity: q } })
  }

  /** 「次へ」：名前 → W → H → 枚数 → 次の行の名前（入力のまま）。名前に移るときはスマホのキーボードを出す */
  const goNext = () => {
    const cur = curCell()
    if (!cur) return
    startInput(nextCell(cur, jobRef.current.parts.length))
  }

  // ---------- 選ぶ・入力 ----------

  /** そのセルの入力を始める。名前は欄を作ってから、押した操作の中で注目を移す（スマホのキーボードが出るように） */
  const startInput = (cell: TableCell) => {
    if (cell.field !== 'name') {
      selectCell(cell)
      return
    }
    flushSync(() => selectCell(cell))
    nameInputs.current.get(inputRow(cell.row, jobRef.current.parts.length))?.focus()
  }

  /** セルを押したとき：1回目は選ぶ、選んでいるセルをもう一度押すと入力（仕様書 17.1） */
  const pressCell = (row: number, field: TableField) => {
    const p = { row, col: colOf(field) }
    const editing = curCell()
    if (editing) {
      if (editing.row === row && editing.field === field) return
      // 入力中にほかのセルを押したら、入力を終えて そのセルを選ぶ
      selectCell(null)
      selectRange(singleRange(p))
      return
    }
    onError(null)
    setNotice(null)
    if (isSingleAt(rangeRef.current, p)) startInput({ row, field })
    else selectRange(singleRange(p))
  }

  /**
   * 式の欄を押したとき（仕様書 27.3・28.2）：選んでいるセルの入力を始める（もう一度押すのと同じ）。
   * 範囲・行・列を選んでいるときは、欄に出している左上のセル。入力中・何も選んでいないときは何もしない
   */
  const pressBar = () => {
    if (curCell()) return
    const r = rangeRef.current ? clampRange(rangeRef.current, rowCount) : null
    if (!r) return
    onError(null)
    setNotice(null)
    startInput({ row: r.top, field: CELL_COLS[r.left] })
  }

  /** 番号を押すと行全体、見出しを押すと列全体（入力中なら入力を終える） */
  const pressRow = (row: number) => {
    if (curCell()) selectCell(null)
    onError(null)
    setNotice(null)
    selectRange(rowRange(row))
  }
  const pressColumn = (col: number) => {
    if (curCell()) selectCell(null)
    onError(null)
    setNotice(null)
    selectRange(columnRange(jobRef.current, col))
  }

  // ---------- オートフィル・長押しのメニュー（仕様書 17.2・17.4。指の動きは useGrid） ----------

  /** オートフィルの取っ手を離したとき：引いた所まで同じ値をくり返して入れる */
  const fillDone = (from: CellRange, to: CellRange) => {
    const r = run({ type: 'fillCells', from, to })
    if (!r.ok) return
    setNotice(r.paste ? fillText(r.paste.pasted, r.paste.skipped) : null)
    // 入れたあとは、引いた先まで選ぶ（エクセルと同じ。起点はそのまま）
    const a = activeRef.current
    selectRange(to, a && rangeHas(to, a) ? a : { row: to.top, col: to.left })
  }

  /** 長押しした所でメニューを開く。選んでいない所なら、そのセル（番号なら行全体）を選んでから */
  const openMenu = (at: PressAt) => {
    if (menuOpen) return
    if (curCell()) selectCell(null)
    const r = rangeRef.current
    if (at.col === null) {
      const whole = r !== null && r.left === 0 && r.cols === CELL_COLS.length && at.row >= r.top && at.row < r.top + r.rows
      if (!whole) selectRange(rowRange(at.row))
    } else {
      const p = { row: at.row, col: at.col }
      if (!r || !rangeHas(r, p)) selectRange(singleRange(p))
    }
    onError(null)
    setNotice(null)
    setMenuOpen(true)
    navigator.vibrate?.(10)
  }

  // ---------- 並べ替え・行の移動（仕様書 24） ----------

  /** 見出しを長押ししたとき：その列を選び、並べ替えのメニューを開く（入力中なら入力を終える） */
  const openSort = (col: number) => {
    if (menuOpen) return
    pressColumn(col)
    setSortCol(col)
    navigator.vibrate?.(10)
  }

  /** 並べ替えて保存する（engine の sortParts。並びが同じなら何も変えない） */
  const sortBy = (col: number, order: SortOrder, label: string) => {
    setSortCol(null)
    const before = jobRef.current.parts.map((p) => p.id).join(',')
    const r = run({ type: 'sortParts', key: SORT_KEY[CELL_COLS[col]], order })
    if (!r.ok) return
    const changed = jobRef.current.parts.map((p) => p.id).join(',') !== before
    setNotice(changed ? `${FIELD_LABEL[CELL_COLS[col]]}の${label}に並べ替えました` : `もう${FIELD_LABEL[CELL_COLS[col]]}の${label}です`)
  }

  /** 番号を押し始めたとき：選んでいる行全体の番号なら、引いて動かせる行（部材のある行だけ）。入力中・メニューを開いている間は動かさない */
  const movableRows = (row: number): MovableRows | null => {
    const r = rangeRef.current
    const n = jobRef.current.parts.length
    if (!r || curCell() || menuOpen || sortCol !== null) return null
    if (r.left !== 0 || r.cols !== CELL_COLS.length || row < r.top || row >= r.top + r.rows || row >= n) return null
    return { top: r.top, rows: Math.min(r.top + r.rows, n) - r.top, limit: n }
  }

  /** 番号を引いて離したとき：行を動かして保存し、動かした行を選んだままにする */
  const moveDone = (top: number, rows: number, to: number) => {
    const n = jobRef.current.parts.length
    const r = run({ type: 'moveParts', from: top, count: rows, to })
    if (!r.ok) return
    onError(null)
    setNotice(null)
    const nextTop = movedTop(n, top, rows, to)
    const a = activeRef.current
    const act = a && a.row >= top && a.row < top + rows ? { row: nextTop + (a.row - top), col: a.col } : { row: nextTop, col: 0 }
    selectRange({ top: nextTop, left: 0, rows, cols: CELL_COLS.length }, act)
  }

  // ---------- 表示 ----------

  const dimsOf = (partId: string) => dims.parts.find((d) => d.partId === partId)
  const selPart = sel ? parts[sel.row] : undefined
  const selLabel = sel ? (selPart && hasName(selPart) ? selPart.name : `#${sel.row + 1}`) : ''
  // 第2.2版（仕様書 26.3）：同じ名前も使えるので、入力中の名前の重なりの知らせは出さない
  const rowMsg = sel?.field === 'name' ? nameMsg : null

  const padAxis: Axis | null = sel && (sel.field === 'W' || sel.field === 'H') ? sel.field : null
  /** 部材の1つの軸の寸法のエラー */
  const axisErrors = (partId: string, axis: Axis) => dimsOf(partId)?.errors.filter((x) => x.axis === axis) ?? []

  // 表に出す範囲（行が減って下にはみ出したら収める）
  const shown = range ? clampRange(range, rowCount) : null
  const shownEnd = shown ? rangeEnd(shown) : null

  // 取っ手と点線の印（オートフィルで新しく入れる所＝引いている間、切り取った元＝同じ仕事のとき）の位置
  const fillExt = dragging === 'fill' && fillTo && shown ? fillExtension(shown, fillTo) : null
  const cutKey = rangeKey(clip?.cut && clip.cut.jobId === job.id ? clampRange(clip.cut.range, rowCount) : null)
  const clipNow = clipText(clip)
  const { handleAt, fillBox, cutBox } = useGridBoxes(tableRef, rowEls, headEls, shown, rangeKey(fillExt), cutKey)

  // 式の欄の中身（仕様書 28.1）：選んだセル（範囲は左上）の中身だけ。入力中は入力中の式（枚数）とカーソル
  const barText = cellBarText(parts, shown)
  const barCursor = padAxis ? Math.max(0, Math.min(barText.length, cursor)) : padOpen ? barText.length : null
  // 欄のすぐ上に出すエラーの理由（仕様書 28.2）：入力中は入れている途中の形を除く。選んでいるだけのときは全部
  const barPart = shown ? parts[shown.top] : undefined
  const barErrors =
    barPart && (barField === 'W' || barField === 'H')
      ? [...new Set((padOpen ? errorsWhileEditing(axisErrors(barPart.id, barField)) : axisErrors(barPart.id, barField)).map((x) => x.message))]
      : []
  const barWho = barPart && hasName(barPart) ? barPart.name : shown ? `${shown.top + 1}行目` : ''

  const rows = Array.from({ length: rowCount }, (_, i) => i)
  const showHandles = shown !== null && shownEnd !== null && !anySel

  // 長押しのメニューの見出し：1つのセルは「天板 の 幅」、範囲は「3行×2列（2〜4行目）」
  const menuTitle = (() => {
    if (!shown) return ''
    if (shown.rows === 1 && shown.cols === 1) {
      const p = parts[shown.top]
      const name = p && hasName(p) ? p.name : p ? `#${shown.top + 1}` : `${shown.top + 1}行目（空）`
      return `${name} の ${FIELD_LABEL[CELL_COLS[shown.left]]}`
    }
    return rangeText(shown)
  })()

  return (
    <>
      {(notice || clipNow) && (
        <div className="pt-status" role="status" aria-live="polite">
          {notice && <p className="pt-notice">{notice}</p>}
          {clipNow && <p className="pt-clip">{clipNow}</p>}
        </div>
      )}
      <div
        className={`pt pt-edit${dragging ? ' dragging' : ''}${moving ? ' moving' : ''}`}
        ref={tableRef}
        role="table"
        aria-label="部材の表（仕上がり寸法）：押して選ぶ、もう一度押して入力、長押しでメニュー"
        {...grid.tableHandlers}
      >
        <div className="pt-row pt-head" role="row">
          <span role="columnheader" className="pt-hno">
            番号
          </span>
          {CELL_COLS.map((f, c) => (
            <span key={f} role="columnheader" className="pt-hwrap">
              <HeadButton
                buttonRef={(el) => {
                  headEls.current[c] = el
                }}
                className={`pt-hcell${c === 0 ? ' left' : ''}${shown && c >= shown.left && c < shown.left + shown.cols ? ' hl' : ''}`}
                label={`${fieldTitle(f)} の列を選ぶ（長押しで並べ替え）`}
                onPress={() => pressColumn(c)}
                onLong={() => openSort(c)}
              >
                {FIELD_LABEL[f]}
              </HeadButton>
            </span>
          ))}
        </div>
        {rows.map((i) => {
          const part = parts[i]
          const key = part ? part.id : `empty-${i}`
          const isSel = (f: TableField) => sel !== null && sel.row === i && sel.field === f
          const rowSel = sel !== null && sel.row === i
          const rowIn = shown !== null && i >= shown.top && i < shown.top + shown.rows
          // 選んでいる行全体の番号は、上下に引くと行を動かせる（なぞってもスクロールしない。仕様書 24.2）
          const grab = !!part && rowIn && !anySel && shown.left === 0 && shown.cols === CELL_COLS.length
          const label = part && hasName(part) ? part.name : `#${i + 1}`
          const rowClass = [
            'pt-row',
            part ? 'part' : 'empty',
            part && part.quantity === null ? 'noqty' : '',
            part?.finishedDone ? 'done' : '',
            rowSel ? 'sel' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const cellPress = (f: TableField) => () => pressCell(i, f)
          // 選んでいる範囲の印：範囲の中は薄い色、外まわりに太い枠、起点（アクティブセル）は色なし
          const rangeCls = (f: TableField): string => {
            if (!shown || !shownEnd) return ''
            const p = { row: i, col: colOf(f) }
            if (!rangeHas(shown, p)) return ''
            const act = active !== null && active.row === i && active.col === p.col
            return [
              ' rs',
              p.row === shown.top ? ' et' : '',
              p.row === shownEnd.row ? ' eb' : '',
              p.col === shown.left ? ' el' : '',
              p.col === shownEnd.col ? ' er' : '',
              act ? ' act' : '',
            ].join('')
          }
          const inRange = (f: TableField) => shown !== null && rangeHas(shown, { row: i, col: colOf(f) })

          const numCell = (
            <button
              type="button"
              className={`pt-cell pt-no${part ? '' : ' muted'}${rowIn ? ' hl' : ''}${grab ? ' grab' : ''}`}
              data-row={i}
              aria-label={`${part ? label : `${i + 1}行目`} の行を選ぶ`}
              onClick={() => pressRow(i)}
            >
              <span className="num">{part && !hasName(part) ? `#${i + 1}` : i + 1}</span>
              {part?.rotatable && (
                <span className="pt-rot" aria-label="回転してよい">
                  ↺
                </span>
              )}
            </button>
          )

          // 名前の欄：入力しているときだけその場で入力できる欄（スマホのキーボード）。ふだんは押して選ぶボタン
          const nameCell = isSel('name') ? (
            <input
              ref={(el) => {
                if (el) nameInputs.current.set(i, el)
                else if (nameInputs.current.get(i) === el) nameInputs.current.delete(i)
              }}
              className={`pt-cell pt-name pt-input on${rowMsg ? ' bad' : ''}`}
              type="text"
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="next"
              aria-label={`${i + 1}行目の名前`}
              value={nameDraft}
              onChange={(e) => {
                setDraft(e.target.value)
                setNameMsg(null)
              }}
              onKeyDown={(e) => onNameKey(i, e)}
              onBlur={() => onNameBlur(i)}
            />
          ) : (
            <button
              type="button"
              className={`pt-cell pt-name${rangeCls('name')}`}
              data-row={i}
              data-col={0}
              aria-label={`${i + 1}行目の名前：${part && hasName(part) ? part.name : '空'}`}
              aria-selected={inRange('name')}
              onClick={cellPress('name')}
            >
              {part && hasName(part) ? part.name : ''}
            </button>
          )

          const dimCellEl = (axis: Axis) => {
            const raw = part ? tableDimCell(part, dimsOf(part.id), axis) : ({ kind: 'empty' } as const)
            // 入力中のセルは赤い「エラー」にしない（入れている途中の「12.」・0.5 を打つ途中の 0 など。理由はキーの上に出す）。
            // 入力を終えたら今までどおり「エラー」
            const c = raw.kind === 'error' && padOpen && isSel(axis) ? ({ kind: 'empty' } as const) : raw
            const text = c.kind === 'empty' ? '' : c.kind === 'error' ? 'エラー' : fmt(c.value)
            // 式の入ったセルは右上に小さな ƒ（仕様書 27.1。数字だけのセルと見分ける）
            const formula = !!part && isSizeFormula(part.expr[axis])
            return (
              <button
                type="button"
                className={`pt-cell pt-dim${c.kind === 'error' ? ' bad' : ''}${isSel(axis) ? ' on' : ''}${rangeCls(axis)}`}
                data-row={i}
                data-col={colOf(axis)}
                aria-label={`${label} の ${FIELD_LABEL[axis]}：${text || '空'}${formula ? `（式 ${sizeLabel(part.expr[axis])}）` : ''}`}
                aria-selected={inRange(axis)}
                onClick={cellPress(axis)}
              >
                {c.kind === 'error' ? 'エラー' : c.kind === 'empty' ? null : <span className="num">{fmt(c.value)}</span>}
                {formula && (
                  <span className="pt-fx" aria-hidden="true">
                    ƒ
                  </span>
                )}
              </button>
            )
          }

          return (
            <div
              key={key}
              className="pt-item"
              role="rowgroup"
              ref={(el) => {
                if (el) rowEls.current.set(i, el)
                else if (rowEls.current.get(i) === el) rowEls.current.delete(i)
              }}
            >
              <div className={rowClass} role="row">
                {numCell}
                {nameCell}
                {dimCellEl('W')}
                {dimCellEl('H')}
                <button
                  type="button"
                  className={`pt-cell pt-qty num${isSel('qty') ? ' on' : ''}${rangeCls('qty')}`}
                  data-row={i}
                  data-col={3}
                  aria-label={`${label} の枚数：${part?.quantity ?? '空'}`}
                  aria-selected={inRange('qty')}
                  onClick={cellPress('qty')}
                >
                  {part?.quantity ?? ''}
                </button>
              </div>
              {rowSel && rowMsg && (
                <p className="pt-msg" role="alert">
                  {rowMsg}
                </p>
              )}
            </div>
          )
        })}
        <GridOverlay
          handleAt={showHandles ? handleAt : null}
          onHandleDown={grid.onHandleDown}
          fillBox={fillBox}
          fillLabel={shown && fillTo ? fillHint(shown, fillTo) : null}
          cutBox={cutBox}
          moveLine={moveLine}
        />
      </div>
      <button type="button" className="btn add-rows" onClick={addRows}>
        ＋ 5行足す
      </button>
      {/* 式の欄（入力中はキーも）を出している間も、表の最後の行・「＋ 5行足す」が隠れないよう、その高さの余白を下に取る */}
      {barOn && <div className="pt-spacer" style={{ height: dockH }} aria-hidden="true" />}
      {menuOpen && shown && (
        <CellMenu
          job={job}
          range={shown}
          title={menuTitle}
          clip={clip}
          dispatch={dispatch}
          onClose={() => setMenuOpen(false)}
          onNotice={setNotice}
          onError={onError}
          onInsertAbove={insertAbove}
          onRowsDeleted={() => selectRange(singleRange({ row: shown.top, col: shown.left }))}
        />
      )}
      {sortCol !== null && (
        <Sheet
          title={`${fieldTitle(CELL_COLS[sortCol])}で並べ替え`}
          onClose={() => setSortCol(null)}
        >
          <div className="cm-group">
            <div className="cm-keys two">
              {sortChoices(CELL_COLS[sortCol]).map((c) => (
                <button key={c.order} type="button" className="btn" onClick={() => sortBy(sortCol, c.order, c.label)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      )}
      {barOn &&
        barField &&
        createPortal(
          <div className={`fxdock${padOpen ? ' editing' : ''}`} ref={dockRef}>
            <div className="fxdock-in">
              {barErrors.length > 0 && (
                <p className="fx-err" role="alert">
                  {barErrors.join('。')}
                </p>
              )}
              <div className="fx-row">
                <button
                  type="button"
                  className={`fx-bar${padOpen ? ' editing' : ''}`}
                  aria-label={`${barWho} の ${FIELD_LABEL[barField]}：${barText || '空'}${padOpen ? '（入力中）' : '（押すと入力）'}`}
                  onPointerDown={keepFocus}
                  onClick={pressBar}
                >
                  <span className="fx-text num">
                    {barCursor === null ? (
                      <span className="fx-chars">{barText}</span>
                    ) : (
                      <>
                        <span className="fx-chars">{barText.slice(0, barCursor)}</span>
                        <span className="caret" aria-hidden="true" />
                        <span className="fx-chars">{barText.slice(barCursor)}</span>
                      </>
                    )}
                    {padOpen && barText === '' && <span className="fx-hint">{padAxis ? '数字か式を入れる' : '枚数を入れる'}</span>}
                  </span>
                  {padOpen && barField === 'qty' && (
                    <span className="fx-note">
                      {selPart?.quantity === null || selPart?.quantity === undefined
                        ? '空＝木取りに入れない'
                        : selPart.quantity === 0
                          ? '寸法だけ（切らない）'
                          : `${selPart.quantity}枚`}
                    </span>
                  )}
                </button>
                {padOpen && (
                  <button type="button" className="fx-done" aria-label="入力を終える" onPointerDown={keepFocus} onClick={() => selectCell(null)}>
                    ✓
                  </button>
                )}
              </div>
              {padOpen && sel && (
                <div className="pt-pad" role="group" aria-label={`${selLabel} の ${FIELD_LABEL[sel.field]} のキー`}>
                  {sel.field === 'qty' ? (
                    <PadKeys size={false} onKey={(k) => pressQty(sel.row, k)} ariaLabel="枚数のキー" onNext={goNext} onClose={() => selectCell(null)} />
                  ) : (
                    padAxis && (
                      <PadKeys
                        size
                        onKey={(k) => pressSize(sel.row, padAxis, k)}
                        ariaLabel={`${FIELD_LABEL[padAxis]} のキー`}
                        onNext={goNext}
                        onClose={() => selectCell(null)}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** ボタンを押しても注目が移らないようにする（入力中の名前の欄からスマホのキーボードが外れないように） */
const keepFocus = (e: ReactPointerEvent) => e.preventDefault()

interface HeadButtonProps {
  buttonRef: (el: HTMLButtonElement | null) => void
  className: string
  label: string
  /** 押したとき（列全体を選ぶ） */
  onPress: () => void
  /** 長押ししたとき（並べ替えのメニュー。仕様書 24.1） */
  onLong: () => void
  children: ReactNode
}

/** 表の見出しのボタン：押すと列全体を選び、長押しで並べ替えのメニュー（長押しの決まりは useLongPress：500ms・指が動いたら取り消し） */
function HeadButton({ buttonRef, className, label, onPress, onLong, children }: HeadButtonProps) {
  const longPress = useLongPress()
  return (
    <button type="button" ref={buttonRef} className={className} aria-label={label} {...longPress(onPress, onLong)}>
      {children}
    </button>
  )
}
