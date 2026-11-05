// kidori-simple のサービスワーカー（仕様書 30.1）。一度開いたアプリの中身を覚えて、電波が無くても開けるようにする。
// - 画面（HTML）は「新しい版を先に取りに行き、取れなければ覚えている版」。新しい版を公開したら、次に開いたときに変わる
// - 画像・JS・CSS などは「覚えていればそれを使い、無ければ取りに行って覚える」（名前に版の印が付くので、中身は変わらない）
// - 保存データ（仕事）は localStorage にあり、ここでは扱わない
const CACHE = 'kidori-simple-v1'
const SHELL = ['./', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png']
// 電波が弱いときに待ち続けないよう、画面を取りに行くのはこの時間まで
const NAV_TIMEOUT_MS = 4000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kidori-simple-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

async function navigate(request) {
  const cache = await caches.open(CACHE)
  try {
    const res = await withTimeout(fetch(request), NAV_TIMEOUT_MS)
    if (res.ok) await cache.put('./', res.clone())
    return res
  } catch {
    return (await cache.match('./')) || (await cache.match(request)) || Response.error()
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok && res.type === 'basic') await cache.put(request, res.clone())
  return res
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // 自分の場所（/kidori-simple/）の中だけ扱う。キドリライトなど同じドメインのほかのアプリには触らない
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.location).pathname)) return
  if (req.mode === 'navigate') event.respondWith(navigate(req))
  else event.respondWith(asset(req))
})
