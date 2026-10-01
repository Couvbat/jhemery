<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import SectionHeader from '@/components/SectionHeader.vue'
import WindowDots from '@/components/WindowDots.vue'
import { music, soundcloudEmbedSrc } from '@/content'
import { useLocale } from '@/i18n'
import { useMusicPlayer } from '@/composables/useMusicPlayer'
import { embedColour } from '@/composables/useTheme'

const { t, m } = useLocale()
const { autoplayNonce } = useMusicPlayer()


// The player is drawn in the scheme's green, read when the frame mounts and again on each
// `play` remount — never on a scheme change: a new `src` reloads the cross-origin player
// and stops whatever it was playing. During setup, so the first `src` is already right.
// `embedColour()` is the scheme's green, but never a forged one's: that would follow the
// visitor to SoundCloud on every visit.
const colour = ref(embedColour())
watch(autoplayNonce, () => {
  colour.value = embedColour()
})
const src = computed(() => soundcloudEmbedSrc(colour.value, autoplayNonce.value > 0))
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
            <WindowDots />
            <span class="ml-3 text-xs text-muted-foreground">ncmpcpp — music player</span>
          </div>
          <div class="p-4 space-y-2">
            <!--
              The `key` remounts the iframe when the terminal `play` command fires, which is
              the only way to hand SoundCloud an autoplay flag it will honour.

              Lazy on first mount: this section is well below the fold, and SoundCloud's
              player drags in a widget bundle, a DataDome script and a pile of third-party
              cookie warnings that nobody who never scrolls here should pay for. The `play`
              remount switches to eager — that iframe is wanted *now*, and waiting on the
              smooth scroll to cross the lazy-load threshold would delay playback.

              `allow` rides along with the same nonce, for the same reason. The grant only
              does anything for the remount, which starts playing with no user gesture
              inside the frame; a visitor pressing play in the widget is gesturing at that
              document directly and is allowed to play without it, which is why embeds
              across the web work fine without the attribute. Requesting it unconditionally
              cost every Firefox visitor a pair of

                Feature Policy: Skipping unsupported feature name “autoplay”.

              warnings on load — Firefox parses `allow` but implements no `autoplay`
              feature to match — in exchange for a permission the page was not yet using.
            -->
            <iframe
              :key="autoplayNonce"
              :src="src"
              :loading="autoplayNonce > 0 ? 'eager' : 'lazy'"
              :allow="autoplayNonce > 0 ? 'autoplay' : undefined"
              width="100%"
              height="400"
              frameborder="0"
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
