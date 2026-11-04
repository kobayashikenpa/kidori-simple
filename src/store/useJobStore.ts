// 画面から保存データを使うためのフック
import { createContext, useContext } from 'react'
import type { AppData, Job } from '../engine/types'
import type { ReduceResult, StoreAction, StoreState } from './reducer'

export interface JobStoreValue {
  state: StoreState
  /** 保存データ（仕事・コピーしたセル） */
  data: AppData
  /** 開いている仕事（無ければ null） */
  job: Job | null
  /** 操作を1回だけ当てる。失敗したら理由を返す（画面に出す） */
  dispatch: (action: StoreAction) => ReduceResult
  /** 保存に失敗したときの知らせ */
  saveError: string | null
}

export const JobStoreContext = createContext<JobStoreValue | null>(null)

export function useJobStore(): JobStoreValue {
  const v = useContext(JobStoreContext)
  if (!v) throw new Error('JobStoreProvider の中で使ってください')
  return v
}
