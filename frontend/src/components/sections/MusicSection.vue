<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const genres = ['Hardcore', 'Techno', 'Acidcore', 'Hard Techno',]
const tools  = ['FL Studio', 'Ableton', 'Akai MPK mini', 'Serum 2', 'Vital', 'DR910', 'Valhalla DSP']

const PLAYLIST_URL = 'https://soundcloud.com/couvbat/sets/mon-bruit'
const SOUNDCLOUD_EMBED_SRC =
  `https://w.soundcloud.com/player/?url=${encodeURIComponent(PLAYLIST_URL)}` +
  '&color=%2300ff41&auto_play=false&hide_related=true&show_comments=false' +
  '&show_reposts=false&show_teaser=false&visual=false'
</script>

<template>
  <section id="music" class="py-20 pt-24">
    <div class="max-w-5xl mx-auto px-4">
      <div class="mb-10">
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">couvbat</span><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">play music.flp</span>
        </p>
        <h2 class="text-2xl md:text-3xl font-bold glow-cyan text-accent">
          <span class="text-accent">#</span> Music
        </h2>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <!-- About music -->
        <Card class="bg-card border-border border-glow-cyan">
          <CardContent class="p-6 space-y-4">
            <div class="text-4xl">♪</div>
            <p class="text-sm text-muted-foreground leading-relaxed">
              Music is my second language. I produce
              <span class="text-accent">hardcore</span>,
              <span class="text-accent">techno</span>,
              <span class="text-accent">acidcore</span> and other hard electronic genres.
              Raw kicks, distorted basslines, relentless BPMs — the same drive I put
              into code goes straight into every track.
            </p>

            <div>
              <p class="text-xs text-muted-foreground mb-2">Genres</p>
              <div class="flex flex-wrap gap-1">
                <Badge
                  v-for="g in genres"
                  :key="g"
                  variant="outline"
                  class="text-xs border-accent/50 text-accent"
                >
                  {{ g }}
                </Badge>
              </div>
            </div>

            <div>
              <p class="text-xs text-muted-foreground mb-2">Tools</p>
              <div class="flex flex-wrap gap-1">
                <Badge
                  v-for="t in tools"
                  :key="t"
                  variant="outline"
                  class="text-xs border-muted text-muted-foreground"
                >
                  {{ t }}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Terminal music player mock -->
        <div class="rounded border border-border bg-card overflow-hidden">
          <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span class="ml-3 text-xs text-muted-foreground">ncmpcpp — music player</span>
          </div>
          <div class="p-4 space-y-2">
            <iframe
              :src="SOUNDCLOUD_EMBED_SRC"
              width="100%"
              height="166"
              frameborder="0"
              allow="autoplay"
              class="rounded"
            ></iframe>
            <p class="text-muted-foreground font-mono text-xs pt-2 border-t border-border">
              Listen on SoundCloud:
              <a
                href="https://soundcloud.com/couvbat"
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent hover:text-accent/80 transition-colors"
              >soundcloud.com/couvbat</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
