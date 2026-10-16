<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import SectionHeader from '@/components/SectionHeader.vue'
import WindowDots from '@/components/WindowDots.vue'
import { music, tempos } from '@/content'
import { useLocale } from '@/i18n'
import { useMusicEmbed, useMusicPlayer } from '@/composables/useMusicPlayer'

const { t, m } = useLocale()
const { autoplayNonce, playerLoaded } = useMusicPlayer()

// Its own chunk, and only in a build with a track to mix (`__HAS_STEMS__`, vite.config.ts):
// with `content/stems.ts` empty, neither the mixer nor the code to fetch it is built.
const StemsMixer = __HAS_STEMS__ ? defineAsyncComponent(() => import('@/components/stems/StemsMixer.vue')) : null

// The button goes when the frame comes, and focus would fall to `<body>` with it.
const frameEl = ref<HTMLIFrameElement | null>(null)
// `src` follows the chosen scheme, but never while the player is playing: it listens to the
// frame for that (see `useMusicEmbed`).
const { src, load: loadFrame, onFrameLoad, listen } = useMusicEmbed(frameEl)
async function load() {
  loadFrame()
  await nextTick()
  frameEl.value?.focus()
}

// What the frame plays, for the field to follow (`components/music/soundcloud-bridge.ts`):
// its own chunk, fetched once there is a frame and never before, as the frame itself is. It
// hears the embed's conversation with the widget rather than starting one. A `play`
// remounts the frame, and a new bridge follows the new one from its first word.
let unfollow: (() => void) | null = null
watch(frameEl, async (frame) => {
  unfollow?.()
  unfollow = null
  if (!frame) return
  const { createSoundCloudBridge } = await import('@/components/music/soundcloud-bridge')
  if (frameEl.value !== frame) return
  const bridge = createSoundCloudBridge({ tempos })
  const unlisten = listen(bridge.receive)
  unfollow = () => {
    unlisten()
    bridge.dispose()
  }
})
onBeforeUnmount(() => unfollow?.())
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
              Behind a button until asked for. SoundCloud's frame sets its own cookies and
              sees the visitor's address the moment it loads, and the CNIL wants consent
              before a third party's trackers, not a banner after them: pressing the button
              is that consent, and so is typing `play`. Nothing is remembered, so the next
              visit asks again, which is the whole of the consent management.

              The `key` remounts the iframe when the terminal `play` command fires, which is
              the only way to hand SoundCloud an autoplay flag it will honour.

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
              v-if="playerLoaded"
              ref="frameEl"
              :key="autoplayNonce"
              :src="src"
              :allow="autoplayNonce > 0 ? 'autoplay' : undefined"
              width="100%"
              height="400"
              frameborder="0"
              class="rounded"
              :title="t(m.music.listen)"
              @load="onFrameLoad"
            ></iframe>
            <div
              v-else
              data-testid="music-consent"
              class="h-[400px] flex flex-col items-center justify-center gap-4 rounded border border-dashed border-border p-6 text-center"
            >
              <p class="text-sm text-muted-foreground max-w-xs leading-relaxed">{{ t(m.music.consent) }}</p>
              <button
                type="button"
                class="px-4 py-2 rounded border border-accent/50 font-mono text-sm text-accent hover:border-accent hover:bg-accent/10 transition-colors"
                @click="load"
              >
                {{ t(m.music.load) }}
              </button>
            </div>
            <p class="text-muted-foreground font-mono text-xs pt-2 border-t border-border">
              {{ t(m.music.listen) }}:
              <a
                :href="music.profileUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent underline underline-offset-2 hover:text-accent/80 transition-colors"
                >soundcloud.com/couvbat</a
              >
            </p>
          </div>
        </div>
      </div>

      <StemsMixer v-if="StemsMixer" class="mt-4" />
    </div>
  </section>
</template>
