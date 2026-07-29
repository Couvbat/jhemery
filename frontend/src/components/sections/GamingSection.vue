<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import SectionHeader from '@/components/SectionHeader.vue'
import { gaming } from '@/content'
import { useLocale } from '@/i18n'
import { useSteam, formatPlaytime } from '@/composables/useSteam'

const { t, m } = useLocale()
const { profile: steamProfile, games: steamGames } = useSteam()

const displayGames = computed(() => {
  if (steamGames.value?.length) {
    return steamGames.value.map((g) => ({
      name: g.name,
      status:
        g.name === steamProfile.value?.inGame
          ? t(m.gaming.inGame)
          : formatPlaytime(g.playtime2Weeks || g.playtimeForever),
      live: g.name === steamProfile.value?.inGame,
    }))
  }
  return gaming.fallbackGames.map((g) => ({
    name: g.name,
    status: t(g.status),
    live: g.status.en === 'Currently playing',
  }))
})
</script>

<template>
  <section id="gaming" class="py-20 pt-24">
    <div class="max-w-5xl mx-auto px-4">
      <SectionHeader section="gaming" tone="purple" />

      <div class="grid gap-4 md:grid-cols-2">
        <!-- About gaming -->
        <Card class="bg-card border-border" style="box-shadow: 0 0 8px rgba(191, 0, 255, 0.2)">
          <CardContent class="p-6 space-y-4">
            <div class="text-4xl">🎮</div>
            <p class="text-sm text-muted-foreground leading-relaxed">
              {{ t(gaming.blurb) }}
            </p>

            <div>
              <p class="text-xs text-muted-foreground mb-2">{{ t(m.gaming.favouriteGenres) }}</p>
              <div class="flex flex-wrap gap-1">
                <Badge
                  v-for="g in gaming.genres"
                  :key="g"
                  variant="outline"
                  class="text-xs border-secondary/50 text-secondary"
                >
                  {{ g }}
                </Badge>
              </div>
            </div>

            <div>
              <p class="text-xs text-muted-foreground mb-2">{{ t(m.gaming.platforms) }}</p>
              <div class="flex flex-wrap gap-1">
                <Badge
                  v-for="p in gaming.platforms"
                  :key="p"
                  variant="outline"
                  class="text-xs border-muted text-muted-foreground"
                >
                  {{ p }}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Game log terminal -->
        <Card class="bg-card border-border overflow-hidden gap-0 py-0">
          <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span class="ml-3 text-xs text-muted-foreground">game-log.txt</span>
          </div>
          <CardContent class="p-4 font-mono text-xs space-y-1">
            <p class="text-muted-foreground mb-2">
              {{ steamProfile ? t(m.gaming.liveFromSteam) : t(m.gaming.recentLog) }}
            </p>
            <p v-if="steamProfile" class="mb-2 flex items-center gap-1.5">
              <span
                :class="[
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  steamProfile.status === 'in-game' || steamProfile.status === 'online'
                    ? 'bg-primary'
                    : 'bg-muted-foreground',
                ]"
              ></span>
              <span class="text-foreground">{{ steamProfile.name }}</span>
              <span class="text-muted-foreground">
                —
                {{
                  steamProfile.inGame
                    ? `${t(m.gaming.inGame)}: ${steamProfile.inGame}`
                    : steamProfile.status
                }}
              </span>
            </p>
            <div v-for="game in displayGames" :key="game.name" class="flex items-center gap-2">
              <span class="text-secondary shrink-0">▸</span>
              <span class="text-foreground flex-1">{{ game.name }}</span>
              <span
                :class="[
                  'text-xs px-1.5 py-0.5 rounded',
                  game.live ? 'bg-primary/20 text-primary' : 'text-muted-foreground',
                ]"
              >
                {{ game.status }}
              </span>
            </div>
            <a
              v-if="steamProfile"
              :href="steamProfile.profileUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-block mt-2 text-secondary hover:underline"
            >
              {{ t(m.gaming.viewProfile) }}
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  </section>
</template>
