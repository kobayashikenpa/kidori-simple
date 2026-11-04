// 部材の画面で選んでいる［仕上がり］［木取り］のタブ（仕様書 5.1）。端末ごとの好みなので localStorage の kidori-simple.ui に置く。
// 読めない・書けないときも画面は「仕上がり」で動く（kidori の dimensionTab.ts と同じ考え方）
import type { KeyValueStorage } from '../store/storage'

export type PartsTab = 'finished' | 'cut'

export const PARTS_TABS: readonly { value: PartsTab; label: string }[] = [
  { value: 'finished', label: '仕上がり' },
  { value: 'cut', label: '木取り' },
]

/** 端末ごとの画面の状態を置くキー（architecture 4章） */
export const UI_KEY = 'kidori-simple.ui'

function readUi(storage: KeyValueStorage | null): Record<string, unknown> {
  try {
    const raw = storage?.getItem(UI_KEY)
    if (!raw) return {}
    const v: unknown = JSON.parse(raw)
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** 覚えているタブ。無い・読めないときは「仕上がり」 */
export function loadPartsTab(storage: KeyValueStorage | null): PartsTab {
  const v = readUi(storage).partsTab
  return PARTS_TABS.some((t) => t.value === v) ? (v as PartsTab) : 'finished'
}

/** タブを覚える（ほかの画面の状態は残す）。書けなくても、いまの画面には効いている */
export function savePartsTab(storage: KeyValueStorage | null, tab: PartsTab): void {
  try {
    storage?.setItem(UI_KEY, JSON.stringify({ ...readUi(storage), partsTab: tab }))
  } catch {
    // 保存できなくても画面は動く
  }
}
