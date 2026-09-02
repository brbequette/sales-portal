self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open('titan-shell-v1').then(function(cache) {
      return cache.addAll([
        '/offline.html',
        '/manifest.json',
        '/titan-app-icon-192.png',
        '/titan-app-icon-512.png'
      ])
    }).then(function() { return self.skipWaiting() })
  )
})

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(key) {
        return key.startsWith('titan-shell-') && key !== 'titan-shell-v1'
      }).map(function(key) { return caches.delete(key) }))
    }).then(function() { return self.clients.claim() })
  )
})

// Never cache authenticated pages or API responses. Navigation gets a network
// attempt and only falls back to the branded offline page if the network is down.
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return
  var requestUrl = new URL(event.request.url)
  if (requestUrl.pathname.indexOf('/api/auth/') === 0 || requestUrl.pathname === '/auth/complete') return
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match('/offline.html')
    })
  )
})

self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json()
    const options = {
      body: data.body,
      icon: data.icon || '/titan-app-icon-192.png',
      badge: '/titan-app-icon-192.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: '2',
        url: data.url
      },
      actions: [
        {action: 'explore', title: 'View Details', icon: '/titan-app-icon-192.png'}
      ]
    }
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    )
  }
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()

  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    )
  } else {
    event.waitUntil(
      clients.openWindow('/')
    )
  }
})
