import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { greet } from './console-greeting'
import { initAnalytics } from './lib/analytics'
import { restoreTheme } from './composables/useTheme'

// Before mount, so nothing is ever painted in the default colours first.
restoreTheme()

const app = createApp(App)

app.use(router)

app.mount('#app')

greet()

// After mount: the tracker is a third-party script on someone else's host, and
// nothing on the page waits for it, so it has no business competing with first
// paint. It records the initial pageview itself on load.
initAnalytics()
