import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../engine/dimensions'
import { shelfJob } from '../engine/fixtures/shelf'
import type { Axis } from '../engine/types'
import { dimCell } from './partCells'
import type { PartsTab } from './partsTab'

function cellOf(name: string, axis: Axis, tab: PartsTab, edit?: (job: ReturnType<typeof shelfJob>) => void) {
  const job = shelfJob()
  edit?.(job)
  const dims = computeDimensions(job)
  const part = job.parts.find((p) => p.name === name)!
  return dimCell(dims.parts.find((d) => d.partId === part.id), axis, tab)
}

describe('部材の表の W・H の欄（仕様書 5.2・26.1・6章の例）', () => {
  it('仕上がりのタブは仕上がり寸法、木取りのタブは木取り寸法（仕上がり ＋ 切り代）', () => {
    expect(cellOf('全体', 'W', 'finished')).toEqual({ kind: 'number', value: 400 })
    expect(cellOf('棚板', 'W', 'finished')).toEqual({ kind: 'number', value: 379 })
    expect(cellOf('棚板', 'W', 'cut')).toEqual({ kind: 'number', value: 389 })
    expect(cellOf('側板', 'H', 'cut')).toEqual({ kind: 'number', value: 710 })
  })
  it('0 はエラー（理由は engine の文）', () => {
    const c = cellOf('側板', 'W', 'finished', (j) => {
      j.parts[2].expr.W = '0'
    })
    expect(c).toEqual({ kind: 'error', messages: ['0 より大きい数を入れてください'] })
  })
  it('空もエラー（表では呼ぶ側が空の欄にする）', () => {
    const c = cellOf('側板', 'H', 'finished', (j) => {
      j.parts[2].expr.H = ''
    })
    expect(c.kind).toBe('error')
  })
})
