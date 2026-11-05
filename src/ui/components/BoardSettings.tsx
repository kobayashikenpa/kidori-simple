// 木取りの画面の上の、板と切り方の設定（仕様書 16.3）：［3×6］［4×8］［自由入力］のボタン（それぞれの枚数・歩留まり。押すとその板に切り替わる）、
// その下に刃厚・端切り・切り代（部材の画面の［木取り］のタブと同じ値。オーナーの指示で木取りの画面でも変えられる）・切り方。開いている仕事に保存する。
// 3×6・4×8 の枚数・歩留まりは engine の compareStandardSizes、自由入力の枚数・歩留まりは今の板の packJob の結果を並べるだけ
import { useState } from 'react'
import { customSheet } from '../../engine/defaults'
import type { SizeComparison, SizeSummary, StandardSize } from '../../engine/packing/sizes'
import { BOARD_SIZES, type CutMode, type Job, type PackingResult, type Settings } from '../../engine/types'
import type { ReduceResult, StoreAction } from '../../store/reducer'
import { pct } from '../kidoriView'
import { CUT_MODES, sheetSizeText } from '../settings'
import { Help } from './Help'
import { NumberField } from './NumberField'
import { Segmented } from './Segmented'

interface Props {
  job: Job
  compare: SizeComparison
  /** 今の板で計算した結果（自由入力のボタンに出す） */
  result: Pick<PackingResult, 'sheetCount' | 'yieldRate' | 'unplaced'>
  /** 切り出す部材が無いか（枚数・歩留まりを「―」にする） */
  empty: boolean
  dispatch: (action: StoreAction) => ReduceResult
}

const SIZE_LABEL: Record<StandardSize, string> = { saburoku: '3×6', shihachi: '4×8' }

export function BoardSettings({ job, compare, result, empty, dispatch }: Props) {
  const s = job.settings
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [numError, setNumError] = useState<string | null>(null)
  const custom = s.sheet.sizeKind === 'custom'

  const pickSize = (kind: StandardSize) => {
    setSheetError(null)
    if (s.sheet.sizeKind === kind) return
    const [width, length] = BOARD_SIZES[kind]
    const r = dispatch({ type: 'setSheet', sheet: { sizeKind: kind, width, length } })
    if (!r.ok) setSheetError(r.message)
  }

  // 自由入力に替えたときは、いまの板の大きさから直してもらう
  const pickCustom = () => {
    setSheetError(null)
    if (custom) return
    const r = dispatch({ type: 'setSheet', sheet: customSheet(s.sheet.width, s.sheet.length) })
    if (!r.ok) setSheetError(r.message)
  }

  const commitSheet = (width: number, length: number): string | null => {
    if (!(width > 0 && length > 0)) return '板の大きさは 0 より大きい数を入れてください'
    const r = dispatch({ type: 'setSheet', sheet: customSheet(width, length) })
    return r.ok ? null : r.message
  }

  const commitNum = (key: 'kerf' | 'trim' | 'allowance') => (v: number) => {
    const r = dispatch({ type: 'updateSettings', patch: { [key]: v } as Partial<Omit<Settings, 'sheet'>> })
    return r.ok ? null : r.message
  }

  const pickCut = (mode: CutMode) => {
    dispatch({ type: 'updateSettings', patch: { cutMode: mode } })
  }

  return (
    <div className="card kd-settings">
      <section className="settings-sec" aria-label="板">
        <h3>
          <Help title="板">
            部材を切り出す板です。ボタンには、その板で計算した必要な板の枚数と歩留まりを出します。押すと、その板に切り替わります（仕事に保存します）。3×6 は 910×1820、4×8 は 1220×2430。ほかの大きさは「自由入力」で妻手×長手を入れます。
          </Help>
        </h3>
        <div className="kd-sizes three">
          {compare.options.map((o) => (
            <SizeButton
              key={o.kind}
              o={o}
              empty={empty}
              current={s.sheet.sizeKind === o.kind}
              fewer={compare.fewer === o.kind}
              higher={compare.higher === o.kind}
              onPick={() => pickSize(o.kind)}
            />
          ))}
          <button
            type="button"
            className="kd-size"
            aria-pressed={custom}
            aria-label={
              custom
                ? `自由入力 ${sheetSizeText(s.sheet)}：必要な板 ${result.sheetCount}枚、歩留まり ${pct(result.yieldRate)}（今の板）`
                : '自由入力：板の大きさを入れる'
            }
            onClick={pickCustom}
          >
            <span className="kd-size-name">自由入力</span>
            {custom ? (
              <>
                <span className="kd-size-count num">
                  {empty ? '―' : result.sheetCount}
                  {!empty && <small>枚</small>}
                </span>
                <span className="kd-size-yield num">{!empty && result.sheetCount > 0 ? pct(result.yieldRate) : '―'}</span>
                {result.unplaced.length > 0 && (
                  <span className="kd-size-tags">
                    <span className="chip bad">収まらない {result.unplaced.length}件</span>
                  </span>
                )}
              </>
            ) : (
              <span className="kd-size-hint">大きさを入れる</span>
            )}
          </button>
        </div>
        {custom && (
          <div className="settings-grid two">
            <div className="field">
              <span className="label">妻手（短い辺）</span>
              <NumberField label="妻手" value={s.sheet.width} onCommit={(v) => commitSheet(v, s.sheet.length)} onError={setSheetError} />
            </div>
            <div className="field">
              <span className="label">長手（長い辺）</span>
              <NumberField label="長手" value={s.sheet.length} onCommit={(v) => commitSheet(s.sheet.width, v)} onError={setSheetError} />
            </div>
          </div>
        )}
        {sheetError && (
          <p className="msg err" role="alert">
            {sheetError}
          </p>
        )}
      </section>

      <section className="settings-sec" aria-label="刃厚・端切り・切り代">
        <div className="settings-grid three">
          <div className="field">
            <Help title={<span className="label">刃厚</span>}>1回切るごとに刃で削れて消える幅です。0 でもかまいません。</Help>
            <NumberField label="刃厚" value={s.kerf} onCommit={commitNum('kerf')} onError={setNumError} />
          </div>
          <div className="field">
            <Help title={<span className="label">端切り</span>}>
              板の端を最初に切り落として矩を出す幅です（刃厚を含む）。0 で端切りなし。
            </Help>
            <NumberField label="端切り" value={s.trim} onCommit={commitNum('trim')} onError={setNumError} />
          </div>
          <div className="field">
            <Help title={<span className="label cut-ink">切り代</span>}>
              あとで削り仕上げるための余分です。木取り寸法 ＝ 仕上がり寸法 ＋ 切り代（幅・長さに同じだけ足す）。部材の画面の［木取り］のタブでも変えられます（どちらで変えても同じ値です）。
            </Help>
            <NumberField label="切り代" value={s.allowance} onCommit={commitNum('allowance')} onError={setNumError} />
          </div>
        </div>
        {numError && (
          <p className="msg err" role="alert">
            {numError}
          </p>
        )}
      </section>

      <section className="settings-sec" aria-label="切り方">
        <h3>
          <Help title="切り方">
            縦切り優先：板を縦長に置き、長手方向の帯を切り出してから切り分けます。横切り優先：板を横長に置き、妻手方向の帯を切り出してから切り分けます。
          </Help>
        </h3>
        <Segmented ariaLabel="切り方" value={s.cutMode} options={CUT_MODES} onChange={pickCut} />
      </section>
    </div>
  )
}

interface SizeButtonProps {
  o: SizeSummary
  empty: boolean
  current: boolean
  fewer: boolean
  higher: boolean
  onPick: () => void
}

function SizeButton({ o, empty, current, fewer, higher, onPick }: SizeButtonProps) {
  const label = SIZE_LABEL[o.kind]
  return (
    <button
      type="button"
      className="kd-size"
      aria-pressed={current}
      aria-label={
        empty
          ? `${label}${current ? '（今の板）' : ''}`
          : `${label}：必要な板 ${o.sheetCount}枚、歩留まり ${pct(o.yieldRate)}${o.unplacedCount > 0 ? `、収まらない部材 ${o.unplacedCount}件` : ''}${current ? '（今の板）' : ''}`
      }
      onClick={onPick}
    >
      <span className="kd-size-name">{label}</span>
      <span className="kd-size-count num">
        {empty ? '―' : o.sheetCount}
        {!empty && <small>枚</small>}
      </span>
      <span className="kd-size-yield num">{!empty && o.sheetCount > 0 ? pct(o.yieldRate) : '―'}</span>
      {!empty && (fewer || higher || o.unplacedCount > 0) && (
        <span className="kd-size-tags">
          {fewer && <span className="chip ok">枚数が少ない</span>}
          {higher && <span className="chip ok">歩留まりが高い</span>}
          {o.unplacedCount > 0 && <span className="chip bad">収まらない {o.unplacedCount}件</span>}
        </span>
      )}
    </button>
  )
}
