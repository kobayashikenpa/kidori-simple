// 板を減らせるときのお知らせ（仕様書 19.2）：切り代や端切りを小さくすると必要な板の枚数が減るときに知らせる。
// 計算は engine の findSavingHint。設定は変えない（知らせるだけ。押しても値は変えない）。
// kidori の components/SavingHints.tsx をもとに、材料ごとの一覧・部材ごとの切り代の知らせを外し、板1種類のお知らせ1つにしたもの
import { useDeferredValue, useMemo } from 'react'
import { findSavingHint } from '../../engine/hints/saving'
import type { Adjust, Job } from '../../engine/types'

export function SavingHint({ job, adjusts }: { job: Job; adjusts: readonly Adjust[] }) {
  // 計算に使うのは 部材・設定・固定した1枚・調整寸法 だけ。更新日時・名前・履歴は計算に使わないので、計算し直しの理由にしない
  const { id, createdAt, parts, settings, frozenSheets } = job
  const input = useMemo(
    () => ({
      job: { id, name: '', createdAt, updatedAt: createdAt, parts, settings, frozenSheets, history: [] } satisfies Job,
      adjusts,
    }),
    [id, createdAt, parts, settings, frozenSheets, adjusts],
  )
  // 何回も木取りを計算し直すので、木取りの結果を先に出してから後回しで計算する（最初は null）
  const deferred = useDeferredValue<typeof input | null>(input, null)
  const hint = useMemo(() => (deferred ? findSavingHint(deferred.job) : null), [deferred])
  // まだ前の内容で計算した結果を出しているとき
  const pending = deferred !== null && deferred !== input

  // 前の結果でお知らせが無ければ、計算し直しているあいだも枠を出さない（画面がずれないように）
  if (!hint) return null

  // 前の結果でお知らせがあれば、計算し直しているあいだも薄く出したままにする（高さを変えない）
  return (
    <aside className={`card kd-hints${pending ? ' pending' : ''}`} aria-label="板を減らせるときのお知らせ" aria-busy={pending}>
      <h4>お知らせ：板を減らせます</h4>
      <p className="kd-hints-msg">
        {hint.message}
        <span className="num kd-hints-count">
          （{hint.from}枚 → {hint.to}枚）
        </span>
      </p>
      <p className="band-note">設定は変えていません</p>
    </aside>
  )
}
