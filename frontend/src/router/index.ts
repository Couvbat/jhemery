import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to) {
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth' }
    }
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      // One view for the page and every tool on it: `/tools/image` is the image tool
      // open, and moving between the two never turns the prism (same view).
      path: '/tools/:tool?',
      name: 'tools',
      component: () => import('../views/ToolsView.vue'),
    },
    {
      // A room code in the path is the same view with a room open, as a tool is for
      // `/tools/:tool` — joining never turns the prism.
      path: '/watch/:code?',
      name: 'watch',
      component: () => import('../views/WatchView.vue'),
    },
    {
      path: '/radio/:code?',
      name: 'radio',
      component: () => import('../views/RadioView.vue'),
    },
    {
      // Deliberately not a face of the prism (it is absent from `content/views.ts`):
      // a fifth destination would cost the navbar room it does not have (#87).
      // `viewIndex()` puts it after the last face, as it does the 404.
      path: '/now',
      name: 'now',
      component: () => import('../views/NowView.vue'),
    },
    {
      // Needs the .htaccess rewrite in public/ to survive a hard refresh on Apache.
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
})

export default router
