import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { decorativeMotion } from '../composables/useMotion'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from) {
    if (to.hash) {
      // Jumps with motion paused, as `scrollToSection` does.
      return { el: to.hash, behavior: decorativeMotion() === 'paused' ? 'auto' : 'smooth' }
    }
    // The same page with another query: `?lang=` or `?run=` taken out of the address.
    // The visitor hasn't gone anywhere, so the page stays where it was.
    if (from.matched.length && to.path === from.path) return false
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
      // What the site keeps in the visitor's browser, and what it sends. Outside the prism
      // like /now, and linked from the footer, so a phone, which has no `du`, gets it too.
      path: '/privacy',
      name: 'privacy',
      component: () => import('../views/PrivacyView.vue'),
    },
    {
      // The case studies (content/work.ts). Like /now, not a face of the prism: they are
      // reached from the projects section, and `viewIndex()` puts them after the faces.
      path: '/work/:id',
      name: 'work',
      component: () => import('../views/WorkView.vue'),
      props: true,
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
