// 部材の表のアプリのキー（第2.2版。仕様書 26.1：W・H は数字だけ。式のキー ＝ ＋ − × ÷ ( ) はなくした）。
// 並び（5列 × 4段。スマホの数字キーボードと同じく、真ん中の3列が数字で 1 2 3 が上）：
//   全部消す 1 2 3 ⌫ ／ ◀ 4 5 6 ▶ ／ 閉じる（2段） 7 8 9 次へ（2段） ／ 0（2列） .
// 第2.1版までの5段から式の段と ( ) をなくし、空いた所は 閉じる・次へ を2段にして詰め、キーを高くした（暫定）。
// W・H も枚数も同じ並び。枚数は数字・1字消す・全部消す だけ押せ、小数点・◀ ▶ は同じ場所に薄く出して押せない。
// 文字の編集はしない（押したキーを onKey で返すだけ。W・H は sizeEdit.ts、枚数は numpad.ts）
import type { PointerEvent, ReactNode } from 'react'
import type { SizeKey } from '../sizeEdit'

/** ボタンを押しても注目が移らないようにする（画面が跳ねない・スマホのキーボードが出ないように） */
const keepFocus = (e: PointerEvent) => e.preventDefault()

interface Props {
  /** キーを押したとき（数字 '0'〜'9'・'.'・'back'・'clear'・'left'・'right'） */
  onKey: (key: SizeKey) => void
  /** W・H のキーか（小数点・◀ ▶ を押せる）。false は枚数のキー（押せない） */
  size: boolean
  /** 「閉じる」「次へ」 */
  onClose: () => void
  onNext: () => void
  ariaLabel?: string
}

type KeyDef = { kind: 'digit'; k: `${number}` } | { kind: 'dot' | 'clear' | 'back' | 'left' | 'right' | 'close' | 'next' }

const d = (k: `${number}`): KeyDef => ({ kind: 'digit', k })

/** キーの並び（左上から順に。閉じる・次へ は2段、0 は2列。CSS のグリッドで詰めて置く） */
const LAYOUT: KeyDef[] = [
  { kind: 'clear' },
  d('1'),
  d('2'),
  d('3'),
  { kind: 'back' },
  { kind: 'left' },
  d('4'),
  d('5'),
  d('6'),
  { kind: 'right' },
  { kind: 'close' },
  d('7'),
  d('8'),
  d('9'),
  { kind: 'next' },
  d('0'),
  { kind: 'dot' },
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
      case 'dot':
        return (
          <button key={i} {...base} className="pad-key num digit" aria-label="小数点" disabled={!size} onClick={() => onKey('.')}>
            .
          </button>
        )
      case 'clear':
        return (
          <button key={i} {...base} className="pad-key" onClick={() => onKey('clear')}>
            全部消す
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
          <button key={i} {...base} className="pad-key tall" onClick={onClose}>
            閉じる
          </button>
        )
      case 'next':
        return (
          <button key={i} {...base} className="pad-key done tall" aria-label="次へ" onClick={onNext}>
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
