<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { drainConfetti, confettiQueue } from '@/composables/useConfetti'

/*
 * Paper confetti would sit oddly on a wireframe terminal, so the particles are
 * monospace glyphs from the same alphabet the rest of the site is drawn in,
 * tinted with the neon palette.
 */
const GLYPHS = ['$', '>', '<', '/', '\\', '*', '#', '+', '=', '~', '^', '1', '0', '{', '}']
const COLOURS = ['#00ff41', '#00ffff', '#bf00ff', '#ff0080', '#d0ffd8']

const BASE_COUNT = 34
const GRAVITY = 900 // px/s²
const DRAG = 0.985 // per 1/60s, keeps the burst from flying off-screen

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  age: number
  ttl: number
  size: number
  glyph: string
  colour: string
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
/** The canvas only exists while something is falling — a full-viewport backing store isn't free. */
const active = ref(false)

let ctx: CanvasRenderingContext2D | null = null
let particles: Particle[] = []
let frameId: number | null = null
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
}

function spawn(x: number, y: number, intensity: number) {
  // Phones get half the confetti: same effect, a third of the fill cost.
  const scale = window.innerWidth < 640 ? 0.5 : 1
  const count = Math.round(BASE_COUNT * intensity * scale)

  for (let i = 0; i < count; i++) {
    // Full 360° with an upward bias, so gravity turns the burst into a fountain
    // rather than a puff — this reads as celebration from any corner of the screen.
    const angle = Math.random() * Math.PI * 2
    const speed = 180 + Math.random() * 240

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 220,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 12,
      age: 0,
      ttl: 1.1 + Math.random() * 0.8,
      size: 11 + Math.random() * 8,
      glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)]!,
    })
  }
}

function draw(timestamp: number) {
  // Seconds since the last frame, clamped so a backgrounded tab doesn't teleport
  // every particle off-screen on the first frame back.
  const dt = lastFrame === 0 ? 1 / 60 : Math.min((timestamp - lastFrame) / 1000, 1 / 20)
  lastFrame = timestamp

  if (!ctx) return

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)

  const decay = DRAG ** (dt * 60)
  const alive: Particle[] = []

  for (const p of particles) {
    p.age += dt
    if (p.age >= p.ttl) continue

    p.vx *= decay
    p.vy = p.vy * decay + GRAVITY * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rot += p.vr * dt

    if (p.y - p.size > window.innerHeight) continue
    alive.push(p)

    // Hold full opacity for the first 60% of the life, then fade out.
    const fade = Math.min(1, (1 - p.age / p.ttl) / 0.4)

    ctx.save()
    ctx.globalAlpha = fade
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    ctx.font = `bold ${p.size}px ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowBlur = 8
    ctx.shadowColor = p.colour
    ctx.fillStyle = p.colour
    ctx.fillText(p.glyph, 0, 0)
    ctx.restore()
  }

  particles = alive

  if (particles.length === 0) {
    stop()
    return
  }
  frameId = requestAnimationFrame(draw)
}

function stop() {
  if (frameId !== null) cancelAnimationFrame(frameId)
  frameId = null
  lastFrame = 0
  particles = []
  ctx = null
  active.value = false
  window.removeEventListener('resize', resize)
}

watch(
  () => confettiQueue.value.length,
  async (length) => {
    if (length === 0) return

    const bursts = drainConfetti()
    const wasIdle = !active.value

    if (wasIdle) {
      active.value = true
      await nextTick()
      resize()
      window.addEventListener('resize', resize)
    }
    if (!canvasRef.value) return

    for (const burst of bursts) spawn(burst.x, burst.y, burst.intensity)
    if (frameId === null) frameId = requestAnimationFrame(draw)
  },
)

onUnmounted(stop)
</script>

<template>
  <canvas
    v-if="active"
    ref="canvasRef"
    aria-hidden="true"
    class="fixed inset-0 z-[75] pointer-events-none"
  ></canvas>
</template>
