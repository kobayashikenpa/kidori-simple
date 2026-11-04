import { describe, expect, it } from 'vitest'
import { normalizeFormulaText, tokenize, validatePartName } from './tokenize'

/** 位置の情報を除いて、字句の中身だけを比べる */
function kinds(expr: string) {
  const r = tokenize(expr)
  if (!r.ok) throw new Error(r.message)
  return r.tokens.map((t) => {
    switch (t.type) {
      case 'number':
        return { number: t.value }
      case 'ref':
        return { ref: [t.part, t.axis] }
      case 'adjust':
        return { adjust: t.adjustId }
      default:
        return t.type
    }
  })
}

describe('tokenize（式の字句の切り出し）', () => {
  it('全体.W - 側板.W * 2 → 参照(全体,W), -, 参照(側板,W), *, 数値2', () => {
    expect(kinds('全体.W - 側板.W * 2')).toEqual([
      { ref: ['全体', 'W'] },
      '-',
      { ref: ['側板', 'W'] },
      '*',
      { number: 2 },
    ])
  })

  it('空白がなくても区切れる', () => {
    expect(kinds('全体.W-側板.W*2')).toEqual([{ ref: ['全体', 'W'] }, '-', { ref: ['側板', 'W'] }, '*', { number: 2 }])
  })

  it('12.5 は数値', () => {
    expect(kinds('12.5')).toEqual([{ number: 12.5 }])
  })

  it('括弧と割り算', () => {
    expect(kinds('(900-18*2)/2')).toEqual(['(', { number: 900 }, '-', { number: 18 }, '*', { number: 2 }, ')', '/', { number: 2 }])
  })

  it('H の参照も読める', () => {
    expect(kinds('全体.H+全体.W')).toEqual([{ ref: ['全体', 'H'] }, '+', { ref: ['全体', 'W'] }])
  })

  it('天板.D は字句のエラー（寸法は W・H だけ。kidori の式を貼ったときなど）', () => {
    const r = tokenize('天板.D - 20')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('天板.D')
      expect(r.message).toContain('W・H')
      expect([r.start, r.end]).toEqual([0, 4])
    }
  })

  it('全角の 天板．Ｄ も字句のエラー', () => {
    expect(tokenize('天板．Ｄ').ok).toBe(false)
  })

  it('小文字の 天板.w は字句のエラー（軸は大文字の W・H）', () => {
    expect(tokenize('天板.w').ok).toBe(false)
  })

  it('数字で始まる部材名も参照として読める（数値とは . の後ろが W/H かで区別できる）', () => {
    expect(kinds('2段目棚板.W')).toEqual([{ ref: ['2段目棚板', 'W'] }])
  })

  it('全角の空白も区切りとして読み飛ばす', () => {
    expect(kinds('全体.W　-　10')).toEqual([{ ref: ['全体', 'W'] }, '-', { number: 10 }])
  })

  it('字句の位置（何文字目から何文字目か）を返す', () => {
    const r = tokenize('全体.W - 2')
    expect(r.ok && r.tokens.map((t) => [t.start, t.end])).toEqual([
      [0, 4],
      [5, 6],
      [7, 8],
    ])
  })

  it('天地板.X は字句のエラー', () => {
    const r = tokenize('天地板.X + 1')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('天地板.X')
      expect(r.start).toBe(0)
    }
  })

  it('@ は字句のエラー', () => {
    const r = tokenize('10 @ 2')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('@')
  })

  it('部材名だけ（.W などなし）はエラー', () => {
    expect(tokenize('全体').ok).toBe(false)
  })

  it('小数点が2つある数値や、. で始まる数値はエラー', () => {
    expect(tokenize('1.2.3').ok).toBe(false)
    expect(tokenize('.5').ok).toBe(false)
    expect(tokenize('5.').ok).toBe(false)
  })

  it('空の式は字句なし（空かどうかの判断は構文解析で行う）', () => {
    expect(tokenize('   ')).toEqual({ ok: true, tokens: [] })
  })
})

describe('validatePartName（部材名に使えるか）', () => {
  it('普通の名前は使える', () => {
    expect(validatePartName('側板')).toBeNull()
    expect(validatePartName('2段目棚板')).toBeNull()
  })

  it('空の名前は使える（第1.1版）。空どうしは重ならない', () => {
    expect(validatePartName('')).toBeNull()
    expect(validatePartName('', ['', '天板'])).toBeNull()
    expect(validatePartName('天板', ['', '天板'])).not.toBeNull()
  })

  it.each(['側+板', '側-板', '側*板', '側/板', '側(板', '側)板', '側.板', '側 板', '側　板'])(
    '記号・空白を含む名前（%s）は使えない',
    (name) => {
      expect(validatePartName(name)).not.toBeNull()
    },
  )

  it('ほかの部材と同じ名前は使えない', () => {
    expect(validatePartName('側板', ['全体', '側板'])).toContain('側板')
  })
})

describe('全角の記号・数字（入力の揺れを吸収する）', () => {
  it('normalizeFormulaText：全角を半角に、× ✕ ÷ − – — を * / - に', () => {
    expect(normalizeFormulaText('（９００＋１０）×２÷４−１–１—１✕１')).toBe('(900+10)*2/4-1-1-1*1')
  })

  it('ー（長音）は置き換えない（部材名に使うため）', () => {
    expect(normalizeFormulaText('ボード.W')).toBe('ボード.W')
  })

  it('全体．Ｗ は 全体.W の参照', () => {
    expect(kinds('全体．Ｗ')).toEqual([{ ref: ['全体', 'W'] }])
  })

  it('字句の位置は、入力したままの文字の位置', () => {
    const r = tokenize('９００　＋　全体．Ｗ')
    expect(r.ok && r.tokens.map((t) => [t.start, t.end])).toEqual([
      [0, 3],
      [4, 5],
      [6, 10],
    ])
  })

  it('全角の数字は数値', () => {
    expect(kinds('１２．５')).toEqual([{ number: 12.5 }])
  })

  it.each(['側＋板', '側−板', '側×板', '側÷板', '側．板', '側（板', '側–板'])(
    '全角の記号や × ÷ − を含む名前（%s）は使えない',
    (name) => {
      expect(validatePartName(name)).not.toBeNull()
    },
  )

  it('全角・半角だけが違う名前は同じ名前とみなす', () => {
    expect(validatePartName('棚板１', ['棚板1'])).not.toBeNull()
  })

  it('長音 ー を含む名前は使える', () => {
    expect(validatePartName('ボード')).toBeNull()
    expect(validatePartName('カウンター')).toBeNull()
  })

  it('ー を含む部材名を参照できる（引き算にならない）', () => {
    expect(kinds('カウンター.W-ボード.H')).toEqual([{ ref: ['カウンター', 'W'] }, '-', { ref: ['ボード', 'H'] }])
  })

  it('全体．Ｗ - 20 は 参照(全体,W), -, 数値20', () => {
    expect(kinds('全体．Ｗ - 20')).toEqual([{ ref: ['全体', 'W'] }, '-', { number: 20 }])
  })
})

describe('調整寸法 {n:id} の字句', () => {
  it('天板.W - {n:adjust-1} → 参照(天板,W), -, 調整寸法(adjust-1)', () => {
    expect(kinds('天板.W - {n:adjust-1}')).toEqual([{ ref: ['天板', 'W'] }, '-', { adjust: 'adjust-1' }])
  })

  it('空白がなくても区切れる（id の中の - は引き算にしない）', () => {
    expect(kinds('全体.W-{n:a1b2-c3}*2-{n:nige-0.5}')).toEqual([
      { ref: ['全体', 'W'] },
      '-',
      { adjust: 'a1b2-c3' },
      '*',
      { number: 2 },
      '-',
      { adjust: 'nige-0.5' },
    ])
  })

  it('字句の位置は { から } まで', () => {
    const r = tokenize('900 - {n:adjust-1}')
    if (!r.ok) throw new Error(r.message)
    expect(r.tokens[2]).toMatchObject({ type: 'adjust', start: 6, end: 18 })
  })

  it('全角の ｛ ｝ も同じに読む', () => {
    expect(kinds('９００－｛n:adjust-1｝')).toEqual([{ number: 900 }, '-', { adjust: 'adjust-1' }])
  })

  it('kidori の材料の厚み {t:id} は字句のエラー（読めない参照）', () => {
    const r = tokenize('600 - {t:b-4}')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('読めない参照')
      expect([r.start, r.end]).toEqual([6, 13])
    }
  })

  it('{x:1} は字句のエラー（読めない参照）', () => {
    const r = tokenize('900 - {x:1}')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('読めない参照')
      expect([r.start, r.end]).toEqual([6, 11])
    }
  })

  it('id が空の {n:} や {n} も字句のエラー', () => {
    expect(tokenize('{n:}').ok).toBe(false)
    expect(tokenize('{n}').ok).toBe(false)
    expect(tokenize('{}').ok).toBe(false)
  })

  it('閉じていない {n:adjust-1 は字句のエラー（式の終わりまでを1つのかたまりにする）', () => {
    const r = tokenize('900 - {n:adjust-1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect([r.start, r.end]).toEqual([6, 17])
  })

  it('閉じていない { の後ろに記号があっても、式の終わりまでを1つのかたまりにする', () => {
    const r = tokenize('{n:adjust-1 + 2')
    expect(r.ok).toBe(false)
    if (!r.ok) expect([r.start, r.end]).toEqual([0, 15])
  })

  it('部材名の直後に { が続いても、別のかたまりとして読む', () => {
    // 並べただけで記号がないのは構文のエラー（字句は読める）
    expect(kinds('全体.W{n:adjust-1}')).toEqual([{ ref: ['全体', 'W'] }, { adjust: 'adjust-1' }])
  })

  it('かたまりの外の } は字句のエラー', () => {
    expect(tokenize('900 }').ok).toBe(false)
  })
})

describe('validatePartName：{ } は使えない', () => {
  it('部材名「棚{1}」は使えない', () => {
    expect(validatePartName('棚{1}')).toContain('{')
  })
  it('全角の ｛ ｝ も使えない', () => {
    expect(validatePartName('棚｛1')).not.toBeNull()
    expect(validatePartName('棚1｝')).not.toBeNull()
  })
})

describe('先頭の「＝」（仕様書 20.2。エクセルと同じく「＝」で始めた式）', () => {
  it('先頭の ＝（全角）・=（半角）は読み飛ばす', () => {
    expect(kinds('＝天板.W - 20')).toEqual([{ ref: ['天板', 'W'] }, '-', { number: 20 }])
    expect(kinds('=天板.W-20')).toEqual([{ ref: ['天板', 'W'] }, '-', { number: 20 }])
  })

  it('前の空白・「＝」の後ろの空白も読み飛ばす', () => {
    expect(kinds('  = 1800 - 40')).toEqual([{ number: 1800 }, '-', { number: 40 }])
  })

  it('「＝」だけなら字句は空', () => {
    expect(kinds('＝')).toEqual([])
  })

  it('途中の「＝」は読めない（読み飛ばすのは先頭の1つだけ）', () => {
    expect(tokenize('1 = 2').ok).toBe(false)
    expect(tokenize('==1').ok).toBe(false)
  })

})
