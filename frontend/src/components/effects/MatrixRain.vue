<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { hideMatrix } from '@/composables/useMatrix'
import { useMotion } from '@/composables/useMotion'
import { useTheme } from '@/composables/useTheme'
import { useLocale } from '@/i18n'

const { t, m } = useLocale()

// Its own guard, not only the command's: whatever shows the rain, it never runs with
// motion paused, and pausing while it falls stops it.
const { level } = useMotion()
watch(level, (motion) => {
  if (motion === 'paused') hideMatrix()
})

const canvasRef = ref<HTMLCanvasElement | null>(null)

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>/\\|=+*-'
const FONT_SIZE = 16

let ctx: CanvasRenderingContext2D | null = null
let frameId: number | null = null
let drops: number[] = []
let lastFrame = 0

/**
 * The rain in the scheme on screen: glyphs in the `--neon-green` slot, each column's
 * head in `--foreground`, trails faded towards `--background`. They were the film's
 * greens, hard-coded, so a light scheme got a black-green rectangle over a pale page.
 * Re-read on a switch, since a canvas keeps no reference to a custom property.
 */
const colours = { trail: '#050a06', glyph: '#00ff41', head: '#d0ffd8' }
function readColours() {
  const style = getComputedStyle(document.documentElement)
  colours.trail = style.getPropertyValue('--background').trim() || '#050a06'
  colours.glyph = style.getPropertyValue('--neon-green').trim() || '#00ff41'
  colours.head = style.getPropertyValue('--foreground').trim() || '#d0ffd8'
}
watch(useTheme().theme, readColours)

/** A token can be `oklch()`, which an older canvas refuses; a refused assignment is
 *  ignored, so the fallback set first is what it keeps. */
function fill(colour: string, fallback: string) {
  ctx!.fillStyle = fallback
  ctx!.fillStyle = colour
}

function resize() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ratio = Math.min(window.devicePixelRatio, 2)
  canvas.width = window.innerWidth * ratio
  canvas.height = window.innerHeight * ratio
  canvas.style.width = `${window.innerWidth}px`
  canvas.style.height = `${window.innerHeight}px`

  ctx = canvas.getContext('2d')
  ctx?.scale(ratio, ratio)

  const columns = Math.ceil(window.innerWidth / FONT_SIZE)
  // Stagger the starting rows so the rain doesn't begin as a solid line.
  drops = Array.from({ length: columns }, () => Math.random() * -50)
}

function draw(timestamp: number) {
  frameId = requestAnimationFrame(draw)

  // ~20fps: the classic effect is choppy, and it costs far less battery.
  if (timestamp - lastFrame < 50) return
  lastFrame = timestamp

  if (!ctx) return

  // Translucent fill rather than clear — this is what leaves the fading trails. The
  // alpha is the context's rather than the colour's, so any token's syntax works.
  ctx.globalAlpha = 0.08
  fill(colours.trail, '#050a06')
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
  ctx.globalAlpha = 1
  ctx.font = `${FONT_SIZE}px monospace`

  for (let i = 0; i < drops.length; i++) {
    const char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!
    const x = i * FONT_SIZE
    const y = drops[i]! * FONT_SIZE

    // Leading glyph is brighter, giving each column a visible head.
    if (Math.random() > 0.975) fill(colours.head, '#d0ffd8')
    else fill(colours.glyph, '#00ff41')
    ctx.fillText(char, x, y)

    if (y > window.innerHeight && Math.random() > 0.975) drops[i] = 0
    drops[i]! += 1
  }
}

function exit() {
  hideMatrix()
}

onMounted(() => {
  if (level.value === 'paused') {
    hideMatrix()
    return
  }
  readColours()
  resize()
  frameId = requestAnimationFrame(draw)
  window.addEventListener('resize', resize)
  window.addEventListener('keydown', exit)
})

onUnmounted(() => {
  if (frameId !== null) cancelAnimationFrame(frameId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('keydown', exit)
})
</script>

<template>
  <div class="fixed inset-0 z-[100] bg-background cursor-pointer" @click="exit">
    <canvas ref="canvasRef" aria-hidden="true"></canvas>
    <p
      class="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-xs text-primary/70 pointer-events-none"
    >
      {{ t(m.matrix.wake) }}
    </p>
  </div>
</template>
