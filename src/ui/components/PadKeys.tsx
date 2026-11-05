// 部材の表のアプリのキー。
// - 第2.2版（仕様書 26.1）：数字だけにした
// - 第2.3版（仕様書 27.2）：＋ − × ÷ ( ) を戻した。今の数字のキーの右に記号の列を1列足し、6列 × 4段にした（暫定）：
//     全部消す 1 2 3 ÷ ⌫ ／ ◀ 4 5 6 × ▶ ／ ( 7 8 9 − ) ／ 閉じる 0（2列） . ＋ 次へ
//   数字は左から2〜4列目（スマホの数字キーボードと同じく 1 2 3 が上）、その右の列が ÷ × − ＋（電卓と同じ上からの順）。
//   ( ) は第2.1版と同じく 7 8 9 の段の両はし。閉じる・次へ は1段の高さにした（第2.2版は2段）
// 幅・長さも枚数も同じ並び。枚数は数字・1字消す・全部消す・閉じる・次へ だけ押せ、小数点・記号・◀ ▶ は同じ場所に薄く出して押せない。
// 文字の編集はしない（押したキーを onKey で返すだけ。幅・長さは sizeEdit.ts、枚数は numpad.ts）
import type { PointerEvent, ReactNode } from 'react'
import type { SizeKey, SizeOpKey } from '../sizeEdit'

/** ボタンを押しても注目が移らないようにする（画面が跳ねない・スマホのキーボードが出ないように） */
const keepFocus = (e: PointerEvent) => e.preventDefault()

interface Props {
  /** キーを押したとき（数字 '0'〜'9'・'.'・式の記号 + - * / ( )・'back'・'clear'・'left'・'right'） */
  onKey: (key: SizeKey) => void
  /** 幅・長さのキーか（小数点・式の記号・◀ ▶ を押せる）。false は枚数のキー（押せない） */
  size: boolean
  /** 「閉じる」「次へ」 */
  onClose: () => void
  onNext: () => void
  ariaLabel?: string
}

type KeyDef =
  | { kind: 'digit'; k: `${number}` }
  | { kind: 'op'; k: SizeOpKey }
  | { kind: 'dot' | 'clear' | 'back' | 'left' | 'right' | 'close' | 'next' }

const d = (k: `${number}`): KeyDef => ({ kind: 'digit', k })
const op = (k: SizeOpKey): KeyDef => ({ kind: 'op', k })

/** 記号のキーの表示と読み上げ（文字に足すのは半角の + - * / ( )） */
const OP_LABEL: Record<SizeOpKey, { label: string; aria: string }> = {
  '+': { label: '＋', aria: '足す' },
  '-': { label: '−', aria: '引く' },
  '*': { label: '×', aria: '掛ける' },
  '/': { label: '÷', aria: '割る' },
  '(': { label: '(', aria: '始めかっこ' },
  ')': { label: ')', aria: '閉じかっこ' },
}

/** キーの並び（左上から順に。0 は2列。CSS のグリッドで詰めて置く。6列 × 4段） */
const LAYOUT: KeyDef[] = [
  { kind: 'clear' },
  d('1'),
  d('2'),
  d('3'),
  op('/'),
  { kind: 'back' },
  { kind: 'left' },
  d('4'),
  d('5'),
  d('6'),
  op('*'),
  { kind: 'right' },
  op('('),
  d('7'),
  d('8'),
  d('9'),
  op('-'),
  op(')'),
  { kind: 'close' },
  d('0'),
  { kind: 'dot' },
  op('+'),
  { kind: 'next' },
]

export function PadKeys({ onKey, size, onClose, onNext, ariaLabel }: Props) {
  const keyOf = (def: KeyDef, i: number): ReactNode => {
    const base = { type: 'button' as const, onPointerDown: keepFocus }
    switch (def.kind) {
      case 'digit':
        return (
          <button key={i} {...base} className={`pad-key num digit${def.k === '0' ? ' span2' : ''}`} onClick={() => onKey(def.k)}>
            {def.k}
          </button>
        )
      case 'op':
        return (
          <button
            key={i}
            {...base}
            className={`pad-key op${def.k === '(' || def.k === ')' ? ' paren' : ''}`}
            aria-label={OP_LABEL[def.k].aria}
            disabled={!size}
            onClick={() => onKey(def.k)}
          >
            {OP_LABEL[def.k].label}
          </button>
        )
      case 'dot':
        return (
          <button key={i} {...base} className="pad-key num digit" aria-label="小数点" disabled={!size} onClick={() => onKey('.')}>
            .
          </button>
        )
      case 'clear':
        return (
          <button key={i} {...base} className="pad-key two-line" aria-label="全部消す" onClick={() => onKey('clear')}>
            全部
            <br />
            消す
          </button>
        )
      case 'back':
        return (
          <button key={i} {...base} className="pad-key" aria-label="1字消す" onClick={() => onKey('back')}>
            <span className="pad-key-icon" aria-hidden="true">
              ⌫
            </span>
            <span className="pad-key-sub" aria-hidden="true">
              1字消す
            </span>
          </button>
        )
      case 'left':
      case 'right':
        return (
          <button
            key={i}
            {...base}
            className="pad-key"
            aria-label={def.kind === 'left' ? 'カーソルを左へ' : 'カーソルを右へ'}
            disabled={!size}
            onClick={() => onKey(def.kind === 'left' ? 'left' : 'right')}
          >
            {def.kind === 'left' ? '◀' : '▶'}
          </button>
        )
      case 'close':
        return (
          <button key={i} {...base} className="pad-key" onClick={onClose}>
            閉じる
          </button>
        )
      case 'next':
        return (
          <button key={i} {...base} className="pad-key done" aria-label="次へ" onClick={onNext}>
            <span>次へ</span>
            <span className="pad-key-sub" aria-hidden="true">
              ↵
            </span>
          </button>
        )
    }
  }

  return (
    <div className="pad" role="group" aria-label={ariaLabel}>
      <div className="pad-keys size-keys">{LAYOUT.map(keyOf)}</div>
    </div>
  )
}
