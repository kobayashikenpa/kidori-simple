// 部材の画面（仕様書 5.1・5.2・9・15.1・16・21）：［仕上がり］［木取り］のタブと部材の表。［仕上がり］は部材の表の下に調整寸法の表（AdjustTable。仕様書 21.1）。
// ［木取り］のタブのときだけ、表の上に切り代（数字キーで変える。仕様書 16.4）。
// ［仕上がり］は入力できる表（押して選ぶ・もう一度押して入力。仕様書 17.1）、［木取り］は同じ形の表を見るだけ。
// 寸法の計算は engine（computeDimensions）、切り出しの進み具合は engine（partCutProgress）に任せる
import { usableAdjusts } from '../../engine/adjusts'
import { useMemo, useState } from 'react'
import { computeDimensions } from '../../engine/dimensions'
import { partCutProgress } from '../../engine/progress/partProgress'
import { browserStorage } from '../../store/storage'
import { useJobStore } from '../../store/useJobStore'
import { CutTable } from '../components/CutTable'
import { Help } from '../components/Help'
import { PartsTable } from '../components/PartsTable'
import { NumberField } from '../components/NumberField'
import { fmt } from '../format'
import { rotationState } from '../partsTable'
import { loadPartsTab, PARTS_TABS, savePartsTab, type PartsTab } from '../partsTab'

const ROTATION_TEXT = { all: 'オン', some: '一部', none: 'オフ' } as const

export function PartsScreen() {
  const { job, data, dispatch } = useJobStore()
  const [tab, setTabState] = useState<PartsTab>(() => loadPartsTab(browserStorage()))
  const [error, setError] = useState<string | null>(null)
  const adjusts = usableAdjusts(data.adjusts)
  const dims = useMemo(() => (job ? computeDimensions(job) : null), [job])
  const progress = useMemo(() => (job ? partCutProgress(job) : []), [job])
  if (!job || !dims) return null

  const setTab = (t: PartsTab) => {
    setTabState(t)
    setError(null)
    savePartsTab(browserStorage(), t)
  }
  const finishedTab = tab === 'finished'
  const rotation = rotationState(job.parts)

  const toggleAllRotation = () => {
    const r = dispatch({ type: 'setAllRotatable', rotatable: rotation !== 'all' })
    setError(r.ok ? null : r.message)
  }

  const commitAllowance = (v: number): string | null => {
    const r = dispatch({ type: 'updateSettings', patch: { allowance: v } })
    return r.ok ? null : r.message
  }

  return (
    <section>
      <h2>
        <Help title="部材">
          部材の名前・W・H・枚数を、［仕上がり］のタブの表に仕上がり寸法で入れます。木取り寸法（仕上がり寸法 ＋
          切り代）は［木取り］のタブで見られます。セルを1回押すと選び、もう一度押すと入力できます。
        </Help>
      </h2>

      <div className="parts-tabs" role="tablist" aria-label="仕上がりと木取りの切り替え">
        {PARTS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            className={`parts-tab ${t.value === 'finished' ? 'fin' : 'cut'}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`parts-band ${finishedTab ? 'fin' : 'cut'}`}>
        {finishedTab ? (
          <Help title="仕上がり寸法">
            家具として完成したときの寸法です。セルを1回押すと選び（太い枠）、選んでいるセルをもう一度押すと入力できます。名前はスマホのキーボード、W・H・枚数は下にアプリのキーが出ます（W・H は数字のほか、式も入れられます）。式はキーの「＝」から始め、ほかの部材の W・H のセルを押すとその寸法（例：天板.W）が入ります（エクセルと同じ。名前の無い部材は使えません）。調整寸法は、表の下の調整寸法の表の行を押すと入ります。「次へ」で 名前 → W → H → 枚数 → 次の行 と、入力したまま進みます。「閉じる」で入力を終えても、セルは選んだままです。選んでいるセルの角の丸い取っ手を引くと、選ぶ範囲を広げられます。番号を押すとその行全体、見出し（名前・W・H・枚数）を押すとその列全体を選びます。見出しを長押しすると並べ替えのメニュー（W・H・枚数は大きい順・小さい順、名前はあいうえお順・逆の順）が出て、並べ替えた順で保存します（空・エラーの部材は一番下。名前の無い部材の「#3」は新しい行の番号になります）。番号を押して行を選んだあと、選んでいる行の番号を上下に引くと、その行を動かせます（複数行も）。セルを長押しすると、切り取り・コピー・貼り付け・クリア・行の挿入と削除・複製・回転・仕上がりのメニューが出ます。右下の四角い取っ手を上か下へ引くと、選んでいるセルの値をくり返して入れます（オートフィル）。式で入れた欄は計算した寸法に「ƒ」が付き、エラーは赤で「エラー」と出ます（押すとキーの上に理由）。枚数が空の行は薄く出て、木取りに入りません（0 は寸法だけの行）。↺ は回転してよい部材、グレーの行は仕上がった部材です。何も入っていない行は保存しません。
          </Help>
        ) : (
          <Help title={`木取り寸法（仕上がり ＋ 切り代 ${fmt(job.settings.allowance)}）`}>
            パネルソーで切る寸法です。見るだけで、ここでは編集できません（入力は［仕上がり］のタブ）。「切った 2/5」は木取りの画面でチェックした数です。枚数 0 の行は「切らない」、枚数が空の行は薄く出て、木取りに入りません。
          </Help>
        )}
      </div>

      {finishedTab ? (
        <>
          <div className="rot-all">
            <Help className="rot-all-label" title="全部回転してよい">
              オンにすると全部の部材が「回転してよい」（W・H を入れ替えて置いてもよい）に、オフにすると全部「回転しない」（W を板の妻手、H を板の長手に合わせて置く）になります。部材ごとに違うときは「一部」と出ます。部材ごとの回転は、セルを長押しして変えます。
            </Help>
            <button
              type="button"
              role="switch"
              aria-checked={rotation === 'all' ? 'true' : rotation === 'some' ? 'mixed' : 'false'}
              aria-label={`全部回転してよい：${ROTATION_TEXT[rotation]}`}
              className={`rot-switch ${rotation}`}
              disabled={job.parts.length === 0}
              onClick={toggleAllRotation}
            >
              <span className="rot-knob" aria-hidden="true" />
              <span className="rot-text">{ROTATION_TEXT[rotation]}</span>
            </button>
          </div>
          <PartsTable job={job} dims={dims} adjusts={adjusts} clip={data.cellClip} dispatch={dispatch} onError={setError} />
        </>
      ) : (
        <>
          <div className="allowance-row">
            <Help className="allowance-label" title={<span className="label cut-ink">切り代</span>}>
              あとで削り仕上げるための余分です。木取り寸法 ＝ 仕上がり寸法 ＋ 切り代（W・H に同じだけ足す）。変えると、下の表の木取り寸法がすぐ変わります。この仕事に保存します（木取りの画面でも変えられ、同じ値です）。
            </Help>
            <NumberField label="切り代" value={job.settings.allowance} onCommit={commitAllowance} onError={setError} />
          </div>
          <CutTable job={job} dims={dims} adjusts={adjusts} progress={progress} />
        </>
      )}
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
