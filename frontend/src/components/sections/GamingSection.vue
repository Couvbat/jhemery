<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const genres    = ['RPG', 'Roguelite', 'Strategy', 'Indie', 'Simulation', 'FPS',]
const platforms = ['PC', 'Steam']

const fallbackGames = [
  { name: 'The Binding of Isaac',   status: 'Real Platinum God' },
  { name: 'Hollow Knight: Silksong',status: 'Currently playing' },
  { name: 'Project Zomboid',        status: 'Currently playing' },
  { name: 'Slay the Spire 2',       status: 'Ascension 10' },
  { name: 'Factorio',               status: '150+ hours' },
  { name: 'Faster Than Light',      status: '200+ hours' },
]

interface SteamRecentGame {
  appId: number
  name: string
  iconUrl: string
  playtime2Weeks: number
  playtimeForever: number
}

interface SteamProfile {
  name: string
  avatar: string
  profileUrl: string
  status: string
  inGame?: string
}

const steamGames = ref<SteamRecentGame[] | null>(null)
const steamProfile = ref<SteamProfile | null>(null)
const steamLoaded = ref(false)

const displayGames = computed(() => {
  if (steamGames.value && steamGames.value.length) {
    return steamGames.value.map((g) => ({
      name: g.name,
      status: g.name === steamProfile.value?.inGame
        ? 'Currently playing'
        : formatPlaytime(g.playtime2Weeks || g.playtimeForever),
    }))
  }
  return fallbackGames
})

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
}

onMounted(async () => {
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${apiUrl}/steam/activity`)
    if (!res.ok) throw new Error('Steam activity unavailable')
    const data = await res.json()
    if (data.configured) {
      steamGames.value = data.recentGames ?? []
      steamProfile.value = data.profile ?? null
    }
  } catch {
    // silently fall back to static log
  } finally {
    steamLoaded.value = true
  }
})
</script>

<template>
  <section id="gaming" class="py-20 pt-24">
    <div class="max-w-5xl mx-auto px-4">
      <div class="mb-10">
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">couvbat</span><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">steam --launch gaming.sh</span>
        </p>
        <h2 class="text-2xl md:text-3xl font-bold glow-purple text-secondary">
          <span class="text-secondary">#</span> Gaming
        </h2>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <!-- About gaming -->
        <Card class="bg-card border-border" style="box-shadow: 0 0 8px rgba(191,0,255,0.2);">
          <CardContent class="p-6 space-y-4">
            <div class="text-4xl">🎮</div>
            <p class="text-sm text-muted-foreground leading-relaxed">
              Gaming is where I unwind, compete, and explore. I love games that challenge
              both my <span class="text-secondary">reflexes</span> and my
              <span class="text-secondary">mind</span> — whether it's optimising a build,
              speedrunning a level, or discovering hidden lore.
            </p>

            <div>
              <p class="text-xs text-muted-foreground mb-2">Favourite genres</p>
              <div class="flex flex-wrap gap-1">
                <Badge
                  v-for="g in genres"
                  :key="g"
                  variant="outline"
                  class="text-xs border-secondary/50 text-secondary"
                >
                  {{ g }}
                </Badge>
              </div>
            </div>

            <div>
              <p class="text-xs text-muted-foreground mb-2">Platforms</p>
              <div class="flex flex-wrap gap-1">
                <Badge
                  v-for="p in platforms"
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
              {{ steamProfile ? 'Live from Steam:' : 'Recent activity log:' }}
            </p>
            <p v-if="steamProfile" class="mb-2 flex items-center gap-1.5">
              <span :class="[
                'w-1.5 h-1.5 rounded-full shrink-0',
                steamProfile.status === 'in-game' || steamProfile.status === 'online'
                  ? 'bg-primary'
                  : 'bg-muted-foreground'
              ]"></span>
              <span class="text-foreground">{{ steamProfile.name }}</span>
              <span class="text-muted-foreground">
                — {{ steamProfile.inGame ? `in-game: ${steamProfile.inGame}` : steamProfile.status }}
              </span>
            </p>
            <div v-for="game in displayGames" :key="game.name" class="flex items-center gap-2">
              <span class="text-secondary shrink-0">▸</span>
              <span class="text-foreground flex-1">{{ game.name }}</span>
              <span :class="[
                'text-xs px-1.5 py-0.5 rounded',
                game.status === 'Currently playing'
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground'
              ]">
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
              view full steam profile ↗
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  </section>
</template>
