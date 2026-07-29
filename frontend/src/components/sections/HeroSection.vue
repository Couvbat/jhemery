<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import HighlightText from '@/components/HighlightText.vue'
import { profile, skills } from '@/content'
import { useLocale } from '@/i18n'

const { t, m, locale } = useLocale()

const bioTerms = [profile.name, profile.alias, profile.employer, profile.location, 'France']

const bio = computed(() => {
  const [intro = '', detail = ''] = t(profile.bio)
  return { intro, detail }
})

const displayed = ref('')
let timer: ReturnType<typeof setInterval> | undefined

function typeTagline() {
  clearInterval(timer)
  const fullText = t(profile.tagline)

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    displayed.value = fullText
    return
  }

  displayed.value = ''
  let i = 0
  timer = setInterval(() => {
    if (i < fullText.length) {
      displayed.value += fullText[i++]
    } else {
      clearInterval(timer)
    }
  }, 45)
}

onMounted(typeTagline)
// Re-type on language switch — a half-English, half-French line looks broken.
watch(locale, typeTagline)
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <section id="about" class="min-h-screen flex items-center pt-14">
    <div class="max-w-5xl mx-auto px-4 py-20 w-full">
      <!-- Terminal window -->
      <div class="rounded border border-border bg-card overflow-hidden border-glow">
        <!-- Title bar -->
        <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
          <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
          <span class="ml-3 text-xs text-muted-foreground">{{ profile.handle }}@{{ profile.host }} ~ bash</span>
        </div>

        <!-- Terminal body -->
        <div class="p-6 md:p-10 space-y-6">
          <!-- whoami -->
          <div>
            <p class="text-muted-foreground text-sm">
              <span class="text-primary">{{ profile.handle }}</span>
              <span class="text-accent">@</span>
              <span class="text-secondary">{{ profile.host }}</span>
              <span class="text-muted-foreground">:~$</span>
              <span class="ml-2 text-foreground">whoami</span>
            </p>
          </div>

          <!-- Name + typing effect -->
          <div>
            <h1 class="text-3xl md:text-5xl font-bold text-primary glow-green tracking-tight">
              {{ displayed }}<span class="animate-pulse">█</span>
            </h1>
          </div>

          <!-- cat about.txt -->
          <div>
            <p class="text-muted-foreground text-sm mb-3">
              <span class="text-primary">{{ profile.handle }}</span><span class="text-muted-foreground">:~$</span>
              <span class="ml-2 text-foreground">{{ t(m.hero.aboutFile) }}</span>
            </p>
            <div class="pl-4 border-l-2 border-primary/40 space-y-2 text-sm md:text-base">
              <p>
                <HighlightText :text="bio.intro" :terms="bioTerms" />
              </p>
              <p class="text-muted-foreground">
                <HighlightText :text="bio.detail" :terms="bioTerms" />
              </p>
              <p class="text-xs text-muted-foreground">🌐 {{ t(profile.languages) }}</p>
            </div>
          </div>

          <!-- ls skills/ -->
          <div>
            <p class="text-muted-foreground text-sm mb-3">
              <span class="text-primary">{{ profile.handle }}</span><span class="text-muted-foreground">:~$</span>
              <span class="ml-2 text-foreground">{{ t(m.hero.skills) }}</span>
            </p>
            <div class="flex flex-wrap gap-2">
              <Badge
                v-for="skill in skills"
                :key="skill"
                variant="outline"
                class="border-primary/50 text-primary hover:bg-primary/10 transition-colors"
              >
                {{ skill }}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
