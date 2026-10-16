<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import HighlightText from '@/components/HighlightText.vue'
import { isExternal, profile, skills } from '@/content'
import { useLocale } from '@/i18n'
import { goTo } from '@/composables/useViewSwing'
import { decorativeMotion } from '@/composables/useMotion'
import WindowDots from '@/components/WindowDots.vue'

const { t, m, locale } = useLocale()

/** Only the skills this repository can show something for; the rest stay plain badges. */
const evidenced = skills.filter((skill) => skill.usedIn?.length)

const bioTerms = [profile.name, profile.alias, profile.employer, profile.location, 'France']

const bio = computed(() => {
  const [intro = '', detail = ''] = t(profile.bio)
  return { intro, detail }
})

const displayed = ref('')
const typing = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

/**
 * While the line types, its cursor is its last character, solid, as a terminal's is while
 * someone types; once it is done, the cursor is an element that blinks. An element that
 * moved with every letter was a layout shift each time, 0.08 of the home page's CLS, and
 * a pseudo-element counts the same. A line that only grows from where it starts does not.
 */
const typedLine = computed(() => (typing.value ? `${displayed.value}█` : displayed.value))

function typeTagline() {
  clearInterval(timer)
  const fullText = t(profile.tagline)

  // Typed under `calm` too; only `paused` (or reduced motion) prints it whole.
  if (decorativeMotion() === 'paused') {
    displayed.value = fullText
    typing.value = false
    return
  }

  displayed.value = ''
  typing.value = true
  let i = 0
  timer = setInterval(() => {
    if (i < fullText.length) {
      displayed.value += fullText[i++]
    } else {
      clearInterval(timer)
      typing.value = false
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
          <WindowDots />
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
            <!-- Named by the whole tagline, not by what has been typed so far: focus can land
                 here mid-animation, and a screen reader would read "full block".
                 The whole line sits under the typed one, invisible, in the same grid cell, so
                 the heading is its final height from the first frame. Typed into an empty
                 box, it grew from one line to three and pushed the page down as it went:
                 0.27 of the home page's 0.32 layout shift. -->
            <h1
              tabindex="-1"
              :aria-label="t(profile.tagline)"
              class="text-3xl md:text-5xl font-bold text-primary glow-green tracking-tight rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            >
              <span aria-hidden="true" class="grid">
                <span class="invisible col-start-1 row-start-1">{{ t(profile.tagline) }}█</span>
                <span class="col-start-1 row-start-1">{{ typedLine }}<span v-if="!typing" class="animate-pulse">█</span></span>
              </span>
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
                :key="skill.name"
                variant="outline"
                class="border-primary/50 text-primary hover:bg-primary/10 transition-colors"
              >
                {{ skill.name }}<span v-if="skill.usedIn?.length" class="text-accent" aria-hidden="true">*</span>
              </Badge>
            </div>
          </div>

          <!-- skills --why: the evidence, one link per place it is used -->
          <div>
            <p class="text-muted-foreground text-sm mb-3">
              <span class="text-primary">{{ profile.handle }}</span><span class="text-muted-foreground">:~$</span>
              <span class="ml-2 text-foreground">skills --why</span>
            </p>
            <dl class="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]" data-testid="skills-why">
              <template v-for="skill in evidenced" :key="skill.name">
                <dt class="text-accent">{{ skill.name }}</dt>
                <dd class="flex flex-wrap gap-x-3 text-muted-foreground">
                  <template v-for="(evidence, i) in skill.usedIn" :key="evidence.where">
                    <span v-if="i > 0" aria-hidden="true">·</span>
                    <a
                      v-if="isExternal(evidence.where)"
                      :href="evidence.where"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="hover:text-primary underline decoration-dotted underline-offset-4 transition-colors"
                    >
                      {{ t(evidence.what) }} ↗
                    </a>
                    <button
                      v-else
                      type="button"
                      class="hover:text-primary underline decoration-dotted underline-offset-4 transition-colors"
                      @click="goTo(evidence.where)"
                    >
                      {{ t(evidence.what) }} →
                    </button>
                  </template>
                </dd>
              </template>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
