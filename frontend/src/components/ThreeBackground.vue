<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { useCrt } from '@/composables/useCrt'
import { activeSection } from '@/composables/useActiveSection'
import { unlocked } from '@/terminal/achievements'

// CRT overdrive spins the wireframes up; reading the ref inside the loop keeps the
// animation frame allocation-free. `glitching` is the same ref that drives the CSS
// screen-tear on `sudo rm -rf /`, so the shapes shake for exactly that window.
const { speedMultiplier, glitching } = useCrt()

const canvasRef = ref<HTMLCanvasElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animationFrameId: number | null = null

interface AnimatedShape {
  mesh: THREE.Mesh
  speed: { x: number; y: number; z: number }
  /** Where the shape drifts back to once nothing is pushing it around. */
  home: THREE.Vector3
  /** Current displacement from `home`, driven by the pointer and by glitches. */
  offset: THREE.Vector3
  /** Accent shapes take the palette's second colour — 3 of the 18. */
  accent: boolean
}

const shapeCount = 18
const accentCount = 3
const shapes: AnimatedShape[] = []

const FOV = 60
const cameraBaseZ = 10

/** How far from the pointer a shape starts to feel it, in world units. */
const GRAVITY_RADIUS = 5
/** How far a shape at the very centre of the well is pulled. */
const GRAVITY_STRENGTH = 0.9
/** No pointer movement for this long and the well lets go. */
const POINTER_IDLE_MS = 2500

let mouseX = 0
let mouseY = 0
let pointerActive = false
let pointerIdleTimer: ReturnType<typeof setTimeout> | undefined

/** The four neon hues from the stylesheet, read once on mount. */
const neon: Record<string, THREE.Color> = {}

interface Palette {
  base: string
  accent: string
  /** Multiplies the rotation speed, on top of the CRT boost. */
  speed: number
}

/** Each section gets its own mood. Falls back to the first entry for anything
 *  unknown, so adding a section can never leave the background unstyled. */
const SECTION_PALETTES: Record<string, Palette> = {
  about: { base: 'green', accent: 'cyan', speed: 1 },
  projects: { base: 'cyan', accent: 'green', speed: 1.25 },
  music: { base: 'purple', accent: 'pink', speed: 1.6 },
  gaming: { base: 'pink', accent: 'purple', speed: 1.45 },
  hardware: { base: 'green', accent: 'purple', speed: 0.85 },
  contact: { base: 'cyan', accent: 'pink', speed: 1 },
}

/** The reward for finding everything: a palette no section can produce. */
const COMPLETIONIST_PALETTE: Palette = { base: 'pink', accent: 'cyan', speed: 1.35 }

let sectionSpeed = 1

// Scratch vectors, reused every frame so the render loop stays allocation-free.
const pointerWorld = new THREE.Vector3()
const target = new THREE.Vector3()

function handleMouseMove(event: MouseEvent) {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1
  mouseY = (event.clientY / window.innerHeight) * 2 - 1
  pointerActive = true
  clearTimeout(pointerIdleTimer)
  pointerIdleTimer = setTimeout(() => {
    pointerActive = false
  }, POINTER_IDLE_MS)
}

function readNeonColor(varName: string, fallback: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return new THREE.Color(value || fallback)
}

/** Half the visible world at the z=0 plane — the frustum maths the spread and the
 *  pointer projection both need. */
function halfExtents(aspect: number): { x: number; y: number } {
  const y = Math.tan(((FOV * Math.PI) / 180) / 2) * cameraBaseZ
  return { x: y * aspect, y }
}

function currentPalette(): Palette {
  if (unlocked.value.has('completionist')) return COMPLETIONIST_PALETTE
  return SECTION_PALETTES[activeSection.value] ?? SECTION_PALETTES.about!
}

/** Recolours the existing materials in place — cheaper than rebuilding the scene,
 *  and the shapes keep their positions across a section change. */
function applyPalette() {
  const palette = currentPalette()
  sectionSpeed = palette.speed

  for (const { mesh, accent } of shapes) {
    const colour = neon[accent ? palette.accent : palette.base]
    if (colour) (mesh.material as THREE.MeshBasicMaterial).color.copy(colour)
  }

  // Nothing is redrawing on its own in the reduced-motion path.
  if (animationFrameId === null && renderer && scene && camera) renderer.render(scene, camera)
}

function createShapes(targetScene: THREE.Scene, aspect: number) {
  neon.green = readNeonColor('--neon-green', '#00ff41')
  neon.cyan = readNeonColor('--neon-cyan', '#00ffff')
  neon.purple = readNeonColor('--neon-purple', '#bf00ff')
  neon.pink = readNeonColor('--neon-pink', '#ff0080')

  const geometries = [
    () => new THREE.IcosahedronGeometry(1, 0),
    () => new THREE.TorusGeometry(0.8, 0.3, 8, 24),
    () => new THREE.BoxGeometry(1.2, 1.2, 1.2),
    () => new THREE.OctahedronGeometry(1, 0),
    () => new THREE.TetrahedronGeometry(1, 0),
    () => new THREE.DodecahedronGeometry(1, 0),
  ]

  // Horizontal spread derived from the camera frustum so narrow/portrait viewports
  // get a proportionally narrower spread instead of a fixed ±10.
  const horizontalSpread = halfExtents(aspect).x * 2

  const accentIndices = new Set<number>()
  while (accentIndices.size < accentCount) {
    accentIndices.add(Math.floor(Math.random() * shapeCount))
  }

  for (let i = 0; i < shapeCount; i++) {
    const geometry = geometries[Math.floor(Math.random() * geometries.length)]!()
    const accent = accentIndices.has(i)
    const material = new THREE.MeshBasicMaterial({
      color: neon.green,
      wireframe: true,
      transparent: true,
      opacity: 0.15 + Math.random() * 0.25,
    })
    const mesh = new THREE.Mesh(geometry, material)

    const home = new THREE.Vector3(
      (Math.random() - 0.5) * horizontalSpread,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 12 - 4,
    )
    mesh.position.copy(home)
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)

    targetScene.add(mesh)
    shapes.push({
      mesh,
      home,
      offset: new THREE.Vector3(),
      accent,
      speed: {
        x: (Math.random() - 0.5) * 0.006,
        y: (Math.random() - 0.5) * 0.006,
        z: (Math.random() - 0.5) * 0.004,
      },
    })
  }

  applyPalette()
}

function handleResize() {
  if (!camera || !renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)

  if (animationFrameId === null && scene) {
    renderer.render(scene, camera)
  }
}

function animate() {
  animationFrameId = requestAnimationFrame(animate)

  const boost = speedMultiplier.value * sectionSpeed
  const shaking = glitching.value

  if (camera && pointerActive) {
    const half = halfExtents(camera.aspect)
    pointerWorld.set(mouseX * half.x, -mouseY * half.y, 0)
  }

  shapes.forEach(({ mesh, speed, home, offset }) => {
    mesh.rotation.x += speed.x * boost
    mesh.rotation.y += speed.y * boost
    mesh.rotation.z += speed.z * boost

    target.set(0, 0, 0)

    // Pointer gravity well: everything inside the radius leans toward the cursor,
    // hardest at the centre. Outside it — or once the pointer goes idle — the
    // target is zero and the shape eases back home on its own.
    if (pointerActive) {
      const dx = pointerWorld.x - home.x
      const dy = pointerWorld.y - home.y
      const distance = Math.hypot(dx, dy)
      if (distance > 0.001 && distance < GRAVITY_RADIUS) {
        const pull = (1 - distance / GRAVITY_RADIUS) * GRAVITY_STRENGTH
        target.set((dx / distance) * pull, (dy / distance) * pull, 0)
      }
    }

    if (shaking) {
      target.x += (Math.random() - 0.5) * 0.7
      target.y += (Math.random() - 0.5) * 0.7
      target.z += (Math.random() - 0.5) * 0.4
    }

    // Snap during a glitch, drift the rest of the time.
    offset.lerp(target, shaking ? 0.65 : 0.045)
    mesh.position.copy(home).add(offset)
  })

  if (camera) {
    const targetX = mouseX * 0.6
    const targetY = -mouseY * 0.4
    camera.position.x += (targetX - camera.position.x) * 0.03
    camera.position.y += (targetY - camera.position.y) * 0.03
    camera.position.z = cameraBaseZ
    camera.lookAt(0, 0, 0)
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

// Both the section and the completionist unlock change how the scene looks; one
// watcher covers them because `currentPalette()` already knows which wins.
watch([activeSection, unlocked], applyPalette)

onMounted(() => {
  if (!canvasRef.value) return

  try {
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.z = cameraBaseZ

    renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)

    createShapes(scene, camera.aspect)
  } catch (error) {
    console.warn('ThreeBackground: WebGL unavailable, skipping animated background.', error)
    return
  }

  if (!renderer || !scene || !camera) return

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion) {
    renderer.render(scene, camera)
  } else {
    animate()
    window.addEventListener('mousemove', handleMouseMove)
  }

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  clearTimeout(pointerIdleTimer)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('mousemove', handleMouseMove)

  shapes.forEach(({ mesh }) => {
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  })
  shapes.length = 0

  renderer?.forceContextLoss()
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="fixed inset-0 -z-10 pointer-events-none"
    aria-hidden="true"
  ></canvas>
</template>
