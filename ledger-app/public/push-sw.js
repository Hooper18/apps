// 付款提醒：Service Worker 里处理推送的部分。
// 由 vite-plugin-pwa 生成的 sw.js 通过 importScripts 引入（见 vite.config.ts），不要单独注册。
//
// 推送内容是后端入口（supabase/functions/ingest/handler.ts 的 PushPayload）发来的 JSON：
//   { title, body, url, tag }

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: '口袋记账', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || '口袋记账'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      icon: '/icons/pwa-192.png',
      badge: '/icons/pwa-192.png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // App 已经开着：告诉它跳到确认页，再把它切到前台
      for (const client of windows) {
        client.postMessage({ type: 'ledger:open', url })
        if ('focus' in client) {
          try {
            await client.focus()
          } catch (e) {
            // 有的系统不让 SW 抢焦点；消息已经发过去了，用户切回来就能看到
          }
        }
        return
      }
      // App 没开：直接打开到确认页
      if (self.clients.openWindow) await self.clients.openWindow(url)
    })(),
  )
})
