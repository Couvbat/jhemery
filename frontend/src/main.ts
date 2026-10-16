// First of all, as it loads: a save link's code comes out of the address before the router
// or the analytics script can read it (`lib/save-link.ts`).
import './lib/save-link'
import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { greet } from './console-greeting'
import { initAnalytics } from './lib/analytics'
import { restoreTheme } from './composables/useTheme'
import { restoreMotion } from './composables/useMotion'
import { apiUrl } from './lib/api'
import { keepAndClear } from './lib/timing-keep'

// Before mount, so nothing is ever painted in the default colours first, and a visitor
// who paused the page never sees the first frame of anything moving.
restoreTheme()
restoreMotion()

// X-ray reads the newest request per route from Resource Timing, and the browser keeps
// 250 entries before it starts dropping new ones: the ticker's poll alone fills that on a
// long visit. Emptied when full, after the newest entry of each API route is kept aside
// for x-ray, so a route fetched once a visit keeps its timing (`lib/timing-keep.ts`).
if ('addEventListener' in performance) {
  performance.addEventListener('resourcetimingbufferfull', () => keepAndClear(apiUrl))
}

const app = createApp(App)

app.use(router)

app.mount('#app')

greet()

// After mount: the tracker is a third-party script on someone else's host, and
// nothing on the page waits for it, so it has no business competing with first
// paint. It records the initial pageview itself on load.
initAnalytics()
