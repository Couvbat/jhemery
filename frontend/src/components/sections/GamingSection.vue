<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import SectionHeader from '@/components/SectionHeader.vue'
import { gaming } from '@/content'
import { useLocale } from '@/i18n'
import { useSteam, formatPlaytime, formatReceipt } from '@/composables/useSteam'
import WindowDots from '@/components/WindowDots.vue'

const { t, m } = useLocale()
const { profile: steamProfile, games: steamGames, favourites } = useSteam()

// What is being played comes from Steam alone, so the card never says *live* while the feed
// is down: with it off, only the favourites show, and they claim nothing about today.
const recentGames = computed(() =>
  (steamGames.value ?? []).map((g) => ({
    name: g.name,
    status:
      g.name === steamProfile.value?.inGame ? t(m.gaming.inGame) : formatPlaytime(g.playtime2Weeks || g.playtimeForever),
    live: g.name === steamProfile.value?.inGame,
  })),
)
</script>

<template>
  <section id="gaming" class="py-20 pt-24" data-api="/steam/activity">
    <div class="max-w-5xl mx-auto px-4">
      <SectionHeader section="gaming" tone="purple" />

      <div class="grid gap-4 md:grid-cols-2">
        <!-- About gaming -->
        <Card class="bg-card border-border" style="box-shadow: 0 0 8px color-mix(in srgb, var(--neon-purple) 20%, transparent)">
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
            <WindowDots />
            <span class="ml-3 text-xs text-muted-foreground">game-log.txt</span>
          </div>
          <CardContent class="p-4 font-mono text-xs space-y-1">
            <p v-if="steamProfile" class="text-muted-foreground mb-2">{{ t(m.gaming.liveFromSteam) }}</p>
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
            <div v-for="game in recentGames" :key="game.name" class="flex items-center gap-2">
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
            <p :class="['text-muted-foreground mb-2', recentGames.length && 'mt-3']">{{ t(m.gaming.favourites) }}</p>
            <div v-for="game in favourites" :key="game.appId" class="flex flex-wrap items-center gap-x-2">
              <span class="text-secondary shrink-0">▸</span>
              <span class="text-foreground flex-1">{{ game.name }}</span>
              <span v-if="game.note || game.receipt" class="text-muted-foreground">
                {{ [game.note && t(game.note), game.receipt && formatReceipt(game.receipt)].filter(Boolean).join(' · ')
                }}<span v-if="game.receipt?.achievements" class="sr-only"> {{ t(m.gaming.achievements) }}</span>
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
