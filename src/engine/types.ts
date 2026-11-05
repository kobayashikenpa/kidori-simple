// kidori-simple の計算で使うデータの形と初期値。寸法はすべて mm の number。
// kidori の types.ts をもとに、材料（Board）・厚み・材料グループ（フラッシュ）・重ね切り・手持ち・端材の行を外したもの

/** 部材の寸法の軸（板の面の2つ）。回転しない部材は W を板の妻手、H を板の長手に合わせて置く */
export type Axis = 'W' | 'H'

export const AXES: readonly Axis[] = ['W', 'H']

// ---------- 入力 ----------

/** 切り方：縦切り優先 / 横切り優先（第1.4版で「おまかせ」をなくした。古いデータの 'auto' は読むときに 'vertical' にする。仕様書 18.2） */
export type CutMode = 'vertical' | 'horizontal'

/** 板のサイズの種類：3×6（サブロク）/ 4×8（シハチ）/ 自由入力 */
export type BoardSizeKind = 'saburoku' | 'shihachi' | 'custom'

/** 定尺板の大きさ［妻手, 長手］。4×8 は 1220×2430（kidori の 2440 とは違う。仕様書 4） */
export const BOARD_SIZES: Readonly<Record<Exclude<BoardSizeKind, 'custom'>, readonly [number, number]>> = {
  saburoku: [910, 1820],
  shihachi: [1220, 2430],
}

/** 板（仕事ごとに1種類） */
export interface Sheet {
  sizeKind: BoardSizeKind
  /** 妻手（mm） */
  width: number
  /** 長手（mm）。width ≦ length にそろえる */
  length: number
}

/** 仕事ごとの設定 */
export interface Settings {
  /** 板（初期値 4×8） */
  sheet: Sheet
  /** 刃厚（初期値 3。0 も可） */
  kerf: number
  /**
   * 端切り（初期値 5）。この幅は刃厚を含む。0 で端切りなし。
   * 縦切り優先は右の長手だけ、横切り優先は下の長手と右の妻手を落とす
   */
  trim: number
  /** 切り代（初期値 10）。W・H に同じ値を足す。部材ごとの上書きは無い */
  allowance: number
  /** 切り方（初期値 縦切り優先） */
  cutMode: CutMode
}

/** 設定の数値の初期値。板はオブジェクトなので含めない（新しい設定は defaults.ts の defaultSettings() で作る） */
export const DEFAULT_SETTINGS: Readonly<Omit<Settings, 'sheet'>> = {
  kerf: 3,
  trim: 5,
  allowance: 10,
  cutMode: 'vertical',
}

/**
 * 前の版（第2.1版まで）の調整寸法（アプリ全体で1つの一覧だった）。kidori の Nige と同じ形。
 * 第2.2版（仕様書 26.2）で調整寸法はなくした。前のデータの式を数字に置き換えるとき（engine/migrate）と、その式の計算（engine/formula）だけで使う
 */
export interface Adjust {
  /** 式からはこの id で参照していた（{n:id}） */
  id: string
  /** 名前（例：逃げ、ほぞ）。空でない */
  name: string
  /** mm。0 より大きい */
  value: number
}

/** 部材 */
export interface Part {
  id: string
  /**
   * 名前。空でもよい（第1.1版。画面では「#3」＝行番号。parts.ts の partLabel）。
   * 第2.2版（仕様書 26.3）から同じ名前の部材があってもよい（式で参照しなくなったため）
   */
  name: string
  /**
   * 仕上がり寸法の入力（W・H）。第2.2版（仕様書 26.1）から数字だけ、第2.3版（仕様書 27.1）から **空・数字・数字と ＋ − × ÷ ( ) だけの式**
   * （例 450-50。保存はそろえた半角の + - * /。キーで入れている途中の「12.」「450-」も）。部材の寸法・調整寸法の参照は無い。
   * 保存の形は前の版と同じ文字のまま（前の版の部材の寸法・調整寸法を使った式は読み込むときに数字に置き換える。engine/migrate/numbers.ts）。読み方は engine/size.ts
   */
  expr: Record<Axis, string>
  /** 枚数（0 は切り出さない寸法だけの行。null は枚数が空＝寸法は計算するが、木取り・必要な枚数・進み具合・比べに入れない） */
  quantity: number | null
  /** 回転してよい（W・H を入れ替えて置いてよい）。初期値 false */
  rotatable: boolean
  /** 仕上がりの完了のチェック。木取りの計算には影響しない */
  finishedDone: boolean
}

/** 仕事 */
export interface Job {
  id: string
  name: string
  settings: Settings
  /** 並び順＝画面の並び順 */
  parts: Part[]
  /** 固定した1枚（固定した順） */
  frozenSheets: FrozenSheet[]
  /**
   * 履歴（第2.1版。仕様書 25.1）。新しい順・最大 20件（engine/history の HISTORY_LIMIT）。部材の W・H も数字だけ（第2.2版）。
   * 第2.0版までの保存データ・バックアップ・送るファイルには無いので、読むときに空にする（shape.ts の readJob）
   */
  history: HistoryEntry[]
  /** ISO 文字列 */
  createdAt: string
  updatedAt: string
}

/**
 * 履歴に残す部材（第2.1版。仕様書 25.1）：名前・W・H（第2.2版から数字だけ）・枚数・回転・仕上がりのチェック。
 * id は持たない（戻すときに新しい id を振る。engine/history の restoreHistory）
 */
export interface HistoryPart {
  name: string
  expr: Record<Axis, string>
  quantity: number | null
  rotatable: boolean
  finishedDone: boolean
}

/** 履歴の1件（第2.1版。仕様書 25.1）。「履歴に残す」を押したときの設定と部材の写しと、そのときの結果 */
export interface HistoryEntry {
  /** 仕事の中で重複しない */
  id: string
  /** 残した日時（ISO） */
  savedAt: string
  /** メモ（空でもよい。画面では空なら「メモなし」） */
  memo: string
  /** 設定（板のサイズ・刃厚・端切り・切り代・切り方）の写し。板のサイズは settings.sheet */
  settings: Settings
  /** 部材の写し（表の並び） */
  parts: HistoryPart[]
  /** そのときの必要な板の枚数（packJob の sheetCount。固定した1枚を含む） */
  sheetCount: number
  /** そのときの全体の歩留まり 0〜1（packJob の yieldRate） */
  yieldRate: number
}

/**
 * 保存する全体。第2.2版（仕様書 26.2）で調整寸法の一覧（adjusts）と調整寸法の表のコピー（adjustClip）はなくした。
 * 前の保存データにあれば、式を数字に置き換えるのに使ってから捨てる（store/storage.ts の readAppData・engine/migrate/numbers.ts）
 */
export interface AppData {
  version: 1
  jobs: Job[]
  /** 最後にコピーしたセル（第1.2版。仕様書 16.1）。無ければ null。ほかの仕事でも貼れる */
  cellClip: CellClip | null
}

// ---------- セルのコピーと貼り付け（第1.2版。仕様書 16.1） ----------

/** 部材の表の欄（左から 名前・W・H・枚数） */
export type CellCol = 'name' | 'W' | 'H' | 'qty'
export const CELL_COLS: readonly CellCol[] = ['name', 'W', 'H', 'qty']

/** 部材の表のセルの位置。row は表の行（0 から。job.parts の位置。部材の数以上は空の行） */
export interface CellPos {
  row: number
  col: CellCol
}

/**
 * コピーしたセル（四角い形）。cells[行][列] はセルの中身の文字（名前・W・H は書いたまま・枚数は数字の文字。空は ''）。
 * 1つのセルなら rows = cols = 1
 */
export interface CellClip {
  rows: number
  cols: number
  cells: string[][]
  /**
   * 切り取ったときの元（第1.3版。仕様書 17.3）。貼ったときに元のセルを空にし、そのあとは消す（ふつうのコピーになる）。
   * 無ければふつうのコピー（第1.2版の保存データも無い）
   */
  cut?: CellCut
}

/**
 * 部材の表の四角い範囲（第1.3版）。left は列の位置（0＝名前 … 3＝枚数）。1つのセルは rows = cols = 1。
 * 行全体は left 0・cols 4、列全体は top 0・rows 部材の数（engine/clipboard/cells の rowRange・columnRange）
 */
export interface CellRange {
  top: number
  left: number
  rows: number
  cols: number
}

/** 切り取った元：仕事の id と範囲 */
export interface CellCut {
  jobId: string
  range: CellRange
}

// ---------- 寸法の計算結果 ----------

/**
 * 寸法のエラーの種類。computeDimensions が出すのは syntax（空・数字でない・計算できない式）と nonPositive（0 以下）と
 * divideByZero（式で 0 で割った。第2.3版）だけ。
 * ほかは前の版の式の計算（engine/migrate/legacyDimensions）だけが出す
 */
export type DimensionErrorKind =
  | 'syntax' // 数字でない・空（前の版：式が読めない）
  | 'unknownRef' // 前の版：存在しない部材名を参照
  | 'unknownAdjust' // 前の版：式が使っている調整寸法が削除されている
  | 'cycle' // 前の版：循環参照
  | 'nonPositive' // 0 以下
  | 'divideByZero' // 0 で割った（第2.3版の数字だけの式・前の版の式）

export interface DimensionError {
  partId: string
  axis: Axis
  kind: DimensionErrorKind
  /** 画面にそのまま出せる日本語 */
  message: string
  /** 前の版：unknownRef の部材名、cycle の部材名の並び */
  refs?: string[]
  /**
   * 入れている途中の形（syntax のときだけ。空・「12.」。前の版は式の終わりが記号・かっこが閉じていない も。第1.4版。仕様書 18.5）。
   * 画面は入力中のセルのこのエラーを出さない
   */
  incomplete?: true
  /** 前の版：エラーのある寸法を参照しているために計算できないとき、元のエラーがある寸法 */
  from?: { partId: string; axis: Axis }
}

export interface PartDimensions {
  partId: string
  /** 表示用の名前（名前が空なら「#行番号」。parts.ts の partLabelAt） */
  name: string
  /** 部材の枚数（null は枚数が空） */
  quantity: number | null
  /** 仕上がり寸法（入れた数字）。エラーがあれば null */
  finished: Record<Axis, number> | null
  /** 木取り寸法（仕上がり ＋ 切り代。W・H それぞれに1回）。エラーがあれば null */
  cut: Record<Axis, number> | null
  /** 軸ごとの仕上がり寸法（出せた軸だけ）。片方の軸だけエラーのときも、もう片方の値は出す */
  finishedByAxis: Partial<Record<Axis, number>>
  /** 軸ごとの木取り寸法（計算できた軸だけ） */
  cutByAxis: Partial<Record<Axis, number>>
  errors: DimensionError[]
}

export interface DimensionResult {
  /** 入力の並び順 */
  parts: PartDimensions[]
  /** 全部材のエラー */
  errors: DimensionError[]
}

// ---------- 木取りの結果（kidori と同じ形から材料・手持ちを外したもの） ----------

/**
 * 板の置き方（配置図の向き）。
 * - portrait（縦長、縦切り優先）：x は妻手方向 0〜width、y は長手方向 0〜length
 * - landscape（横長、横切り優先）：x は長手方向 0〜length、y は妻手方向 0〜width
 */
export type SheetOrientation = 'portrait' | 'landscape'

/**
 * 板の上の長方形。その板の置き方（SheetOrientation）の座標で、左下を原点とする（x は右が +、y は上が +）。
 * 配置図の上＝奥、右＝端切りをした側
 */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Placement extends Rect {
  /**
   * `${partId}#${連番}`。1枚の中でだけ重ならない。1枚をまたぐ区別は1枚の id と組にする
   * （固定した1枚の片を引いたあと、残りの片の連番は #1 からふり直すため、別の1枚に同じ pieceId があり得る）
   */
  pieceId: string
  partId: string
  /** 表示用の名前（並べたときの partLabel。名前が空なら「#行番号」） */
  name: string
  /** 部材の W を板の妻手方向に置いたとき false、W を長手方向に置いた（回転した）とき true（置き方によらない） */
  rotated: boolean
  /** 配置図に出す寸法（例："1810×410"） */
  sizeLabel: string
}

/** 配置図の上で 縦に切る（線が y 方向）/ 横に切る（線が x 方向）。縦長に置いたときは 縦＝長手と平行 */
export type CutDirection = 'vertical' | 'horizontal'

export interface CutStep {
  /** 1 から */
  no: number
  direction: CutDirection
  /** 切る線の位置：vertical なら x、horizontal なら y */
  at: number
  /** 切る範囲（この長方形を2つに分ける） */
  within: Rect
  /** 端切り / 帯を切る / 帯を切り分ける / 幅を切り揃える */
  kind: 'trim' | 'strip' | 'crosscut' | 'rip'
  /** 画面用の日本語（例：「右端から 410mm で縦に切る」） */
  label: string
}

export interface SheetLayout {
  /** 何枚目か（1 から）。計算した1枚は固定した1枚があっても 1 から（画面で通し番号を振り直す） */
  index: number
  /** 妻手 */
  boardWidth: number
  /** 長手 */
  boardLength: number
  /**
   * 配置図の向き。portrait なら図の大きさは boardWidth×boardLength、
   * landscape なら boardLength（横）×boardWidth（縦）。ほかの Rect はすべてこの向きの座標
   */
  orientation: SheetOrientation
  /** 端切りで落とす部分（切る順番と同じ並び）。端切り0 なら空 */
  trims: Rect[]
  /** 端切り後に使える範囲 */
  usable: Rect
  placements: Placement[]
  cuts: CutStep[]
  /** 端材 */
  scraps: Rect[]
  /** 部材（木取り寸法）の面積の合計 */
  usedArea: number
  /** 歩留まり 0〜1 */
  yieldRate: number
}

/** 入らない部材の理由。tooLarge：板のどの向きにも入らない */
export type UnplacedReason = 'tooLarge'

export interface PackingResult {
  /** 計算に使った板 */
  sheet: Sheet
  /** 実際に使った切り方（設定の切り方と同じ） */
  mode: 'vertical' | 'horizontal'
  /** 固定した1枚を除いた、計算した1枚 */
  sheets: SheetLayout[]
  /** 必要な板の枚数（固定した1枚を含む） */
  sheetCount: number
  /** 全体の歩留まり */
  yieldRate: number
  /** 板に収まらない部材（name は表示用の名前） */
  unplaced: { partId: string; name: string; reason: UnplacedReason }[]
  /** 寸法のエラーで計算から外した部材（name は表示用の名前。枚数が 0・空の部材は入れない） */
  skipped: { partId: string; name: string; reason: 'dimensionError' }[]
}

// ---------- 切りながら進める木取り ----------

/**
 * 固定した1枚（kidori の FrozenSheet から材料・重ね切りを外したもの）。1つ目の片にチェックしたときに、
 * 画面に出ていた1枚を写して作る。部材や設定が変わっても、この写しは変わらない
 */
export interface FrozenSheet {
  /** 仕事の中で重複しない */
  id: string
  /** 固定したときの板 */
  sheet: Sheet
  /** 固定したときの切り方 */
  mode: 'vertical' | 'horizontal'
  /** 固定したときの刃厚 */
  kerf: number
  /** 固定したときの端切り */
  trim: number
  /** 固定したときの1枚（深いコピー。index は使わない＝表示のときに振り直す） */
  layout: SheetLayout
  /** チェックした片の pieceId（layout.placements にあるものだけ・重複なし） */
  checked: string[]
  /** ISO */
  frozenAt: string
  /** すべての片にチェックした時刻（ISO）。あれば「切り終わり」 */
  completedAt?: string
}
