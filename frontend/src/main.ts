import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { greet } from './console-greeting'
import { initAnalytics } from './lib/analytics'

const app = createApp(App)

app.use(router)

app.mount('#app')

greet()

// After mount: the tracker is a third-party script on someone else's host, and
// nothing on the page waits for it, so it has no business competing with first
// paint. It records the initial pageview itself on load.
initAnalytics()
