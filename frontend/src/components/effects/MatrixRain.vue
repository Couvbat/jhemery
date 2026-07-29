<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { hideMatrix } from '@/composables/useMatrix'

const canvasRef = ref<HTMLCanvasElement | null>(null)

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>/\\|=+*-'
const FONT_SIZE = 16

let ctx: CanvasRenderingContext2D | null = null
let frameId: number | null = null
let drops: number[] = []
let lastFrame = 0

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

  // Translucent fill rather than clear — this is what leaves the fading trails.
  ctx.fillStyle = 'rgba(5, 10, 6, 0.08)'
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
  ctx.font = `${FONT_SIZE}px monospace`

  for (let i = 0; i < drops.length; i++) {
    const char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!
    const x = i * FONT_SIZE
    const y = drops[i]! * FONT_SIZE

    // Leading glyph is brighter, giving each column a visible head.
    ctx.fillStyle = Math.random() > 0.975 ? '#d0ffd8' : '#00ff41'
    ctx.fillText(char, x, y)

    if (y > window.innerHeight && Math.random() > 0.975) drops[i] = 0
    drops[i]! += 1
  }
}

function exit() {
  hideMatrix()
}

onMounted(() => {
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
  <div class="fixed inset-0 z-[100] bg-[#050a06] cursor-pointer" @click="exit">
    <canvas ref="canvasRef" aria-hidden="true"></canvas>
    <p
      class="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-xs text-primary/70 pointer-events-none"
    >
      press any key to wake up
    </p>
  </div>
</template>
