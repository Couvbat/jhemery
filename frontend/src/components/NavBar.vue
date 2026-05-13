<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const sections = [
  { id: 'about',    label: 'about' },
  { id: 'projects', label: 'projects' },
  { id: 'music',    label: 'music' },
  { id: 'gaming',   label: 'gaming' },
  { id: 'hardware', label: 'hardware' },
  { id: 'contact',  label: 'contact' },
]

const activeSection = ref('about')
const menuOpen = ref(false)

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  menuOpen.value = false
}

function onScroll() {
  for (const s of [...sections].reverse()) {
    const el = document.getElementById(s.id)
    if (el && window.scrollY >= el.offsetTop - 120) {
      activeSection.value = s.id
      break
    }
  }
}

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <header class="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur border-b border-border">
    <nav class="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
      <!-- Logo / Name -->
      <button @click="scrollTo('about')" class="text-primary font-bold glow-green tracking-wider hover:opacity-80 transition-opacity">
        <span class="text-muted-foreground">~/</span>Couvbat
      </button>

      <!-- Desktop links -->
      <ul class="hidden md:flex gap-1">
        <li v-for="s in sections" :key="s.id">
          <button
            @click="scrollTo(s.id)"
            :class="[
              'px-3 py-1 text-sm rounded transition-colors',
              activeSection === s.id
                ? 'text-primary glow-green'
                : 'text-muted-foreground hover:text-foreground'
            ]"
          >
            <span class="text-muted-foreground">./</span>{{ s.label }}
          </button>
        </li>
      </ul>

      <!-- Mobile hamburger -->
      <button class="md:hidden text-primary p-2" @click="menuOpen = !menuOpen" aria-label="Toggle menu">
        <svg v-if="!menuOpen" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </nav>

    <!-- Mobile menu -->
    <div v-if="menuOpen" class="md:hidden border-t border-border bg-background">
      <ul class="flex flex-col px-4 py-2">
        <li v-for="s in sections" :key="s.id">
          <button @click="scrollTo(s.id)" class="w-full text-left py-2 text-sm text-muted-foreground hover:text-primary transition-colors">
            <span>$ cd ./{{ s.label }}</span>
          </button>
        </li>
      </ul>
    </div>
  </header>
</template>
