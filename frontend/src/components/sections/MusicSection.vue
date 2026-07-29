<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import SectionHeader from '@/components/SectionHeader.vue'
import { music, soundcloudEmbedSrc } from '@/content'
import { useLocale } from '@/i18n'
import { useMusicPlayer } from '@/composables/useMusicPlayer'

const { t, m } = useLocale()
const { autoplayNonce } = useMusicPlayer()
</script>

<template>
  <section id="music" class="py-20 pt-24">
    <div class="max-w-5xl mx-auto px-4">
      <SectionHeader section="music" tone="cyan" />

      <div class="grid gap-4 md:grid-cols-2">
        <!-- About music -->
        <Card class="bg-card border-border border-glow-cyan">
          <CardContent class="p-6 space-y-4">
            <div class="text-4xl">♪</div>
            <p class="text-sm text-muted-foreground leading-relaxed">
              {{ t(music.blurb) }}
            </p>

            <div>
              <p class="text-xs text-muted-foreground mb-2">{{ t(m.music.genres) }}</p>
              <div class="flex flex-wrap gap-1">
                <Badge
                  v-for="g in music.genres"
                  :key="g"
                  variant="outline"
                  class="text-xs border-accent/50 text-accent"
                >
                  {{ g }}
                </Badge>
              </div>
            </div>

            <div>
              <p class="text-xs text-muted-foreground mb-2">{{ t(m.music.tools) }}</p>
              <div class="flex flex-wrap gap-1">
                <Badge
                  v-for="tool in music.tools"
                  :key="tool"
                  variant="outline"
                  class="text-xs border-muted text-muted-foreground"
                >
                  {{ tool }}
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
            <!--
              The `key` remounts the iframe when the terminal `play` command fires, which is
              the only way to hand SoundCloud an autoplay flag it will honour.
            -->
            <iframe
              :key="autoplayNonce"
              :src="autoplayNonce > 0 ? `${soundcloudEmbedSrc}&auto_play=true` : soundcloudEmbedSrc"
              width="100%"
              height="166"
              frameborder="0"
              allow="autoplay"
              class="rounded"
              :title="t(m.music.listen)"
            ></iframe>
            <p class="text-muted-foreground font-mono text-xs pt-2 border-t border-border">
              {{ t(m.music.listen) }}:
              <a
                :href="music.profileUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent hover:text-accent/80 transition-colors"
                >soundcloud.com/couvbat</a
              >
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
