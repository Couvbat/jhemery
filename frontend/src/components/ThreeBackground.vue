<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { useCrt } from '@/composables/useCrt'
import { useMotion } from '@/composables/useMotion'
import { activeSection } from '@/composables/useActiveSection'
import { terminalOpen } from '@/composables/useTerminalShell'
import { BASE_SHAPE_COUNT, MAX_SHAPE_COUNT, useSceneControl } from '@/composables/useSceneControl'
import { fetchWeather, weatherMood } from '@/composables/useWeather'
import { useTheme } from '@/composables/useTheme'
import { useViewSwing } from '@/composables/useViewSwing'
import { startScreensaver, useScreensaver } from '@/composables/useIdle'
import { useLocale } from '@/i18n'
import { unlock, unlocked } from '@/terminal/achievements'

// CRT overdrive spins the wireframes up; reading the ref inside the loop keeps the
// animation frame allocation-free. `glitching` is the same ref that drives the CSS
// screen-tear on `sudo rm -rf /`, so the shapes shake for exactly that window.
const { speedMultiplier, glitching } = useCrt()
const { shapeCount, gravityOn, constellationOn, visitorShapes } = useSceneControl()
const { screensaver } = useScreensaver()
const { t, m } = useLocale()
// The prism swing between views (features-spec §11). The router drives one eased
// clock; the DOM turns the pages by it and this component turns the field by it.
const { swing, swingDirection, swinging, activeView } = useViewSwing()
const { theme } = useTheme()
// `full`, `calm` or `paused` (composables/useMotion.ts). This component only mounts once
// the level has been something other than `paused`; pausing afterwards stops the loop.
const { level: motion } = useMotion()

const canvasRef = ref<HTMLCanvasElement | null>(null)
/** What `click-to-inspect` is currently showing, if anything. */
const inspected = ref<{ text: string; x: number; y: number } | null>(null)
let inspectTimer: ReturnType<typeof setTimeout> | undefined

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
/** Every shape and the constellation lines live in here, not in the scene directly,
 *  so a view swing can turn the whole field about the slab's centre. */
let field: THREE.Group | null = null
let camera: THREE.PerspectiveCamera | null = null
let animationFrameId: number | null = null

interface ShapeKind {
  /** Shown by click-to-inspect, e.g. `icosahedron · 20 faces`. */
  label: string
  make: () => THREE.BufferGeometry
}

const KINDS: ShapeKind[] = [
  { label: 'icosahedron · 20 faces', make: () => new THREE.IcosahedronGeometry(1, 0) },
  { label: 'torus · 8×24 segments', make: () => new THREE.TorusGeometry(0.8, 0.3, 8, 24) },
  { label: 'cube · 6 faces', make: () => new THREE.BoxGeometry(1.2, 1.2, 1.2) },
  { label: 'octahedron · 8 faces', make: () => new THREE.OctahedronGeometry(1, 0) },
  { label: 'tetrahedron · 4 faces', make: () => new THREE.TetrahedronGeometry(1, 0) },
  { label: 'dodecahedron · 12 faces', make: () => new THREE.DodecahedronGeometry(1, 0) },
]

interface AnimatedShape {
  mesh: THREE.Mesh
  speed: { x: number; y: number; z: number }
  /** Where the shape drifts back to once nothing is pushing it around. */
  home: THREE.Vector3
  /** Current displacement from `home`, driven by the pointer and by glitches. */
  offset: THREE.Vector3
  /** Accent shapes take the palette's second colour — 3 of the initial 18. */
  accent: boolean
  /** Opacity before the weather mood scales it, so the nudge stays reversible. */
  baseOpacity: number
  kind: ShapeKind
  /** Only on a visitor's shape: how far it has faded in, and whether it is going. */
  presence?: { level: number; leaving: boolean }
}

const shapes: AnimatedShape[] = []
/** Reused by the raycaster; kept in step with `shapes` on every add/remove. */
const meshes: THREE.Mesh[] = []
/**
 * One shape per other person on the site (`visitorShapes`), in a pool of their own so
 * `spawn`, `scene reset` and the accent count never see them. They fade in on arrival
 * and out on departure, and are only disposed once fully gone.
 */
const visitors: AnimatedShape[] = []
/** How much of the way to its target a visitor's fade moves each frame. */
const VISITOR_FADE = 0.025

/** Both pools, without allocating — the swing and the render loop visit every shape. */
function forEachShape(fn: (shape: AnimatedShape) => void) {
  for (const shape of shapes) fn(shape)
  for (const shape of visitors) fn(shape)
}

const accentSeeds = 3
/** Roughly the initial 3-in-18 ratio, for anything `spawn` adds later. */
const ACCENT_CHANCE = accentSeeds / BASE_SHAPE_COUNT

const FOV = 60
const cameraBaseZ = 10

/** How far from the pointer a shape starts to feel it, in world units. */
const GRAVITY_RADIUS = 5
/** How far a shape at the very centre of the well is pulled. */
const GRAVITY_STRENGTH = 0.9
/** No pointer movement for this long and the well lets go. */
const POINTER_IDLE_MS = 2500
/** Shapes closer than this get a constellation line between them. */
const LINK_DISTANCE = 5.5
/** How long the camera keeps looking at an inspected shape. */
const FOCUS_MS = 2200

/**
 * The view swing, in three numbers. The field of homes is a slab roughly 20 × 14 × 12
 * units centred this far behind the z=0 plane, with the camera at z=10 — so a literal
 * 90° camera orbit would put the camera on the slab's edge. Instead the *field* yaws
 * about its own centre (the same image as a camera yaw, with the camera left where
 * every invariant assumes it is), by a modest angle: the pages do a true 90° because
 * "next face" means 90° for a prism, but the cloud only has to agree in direction and
 * timing, and 90° of a 20-wide slab flies shapes through the lens. The dolly pulls the
 * camera back over the swing so nothing clips the near plane on the way round.
 */
const FIELD_DEPTH = -4
const FIELD_YAW = (40 * Math.PI) / 180
const DOLLY = 6

/**
 * The loop runs on elapsed time, not on frames. It used to add a fixed step per frame,
 * so a 120 Hz screen ran the field at twice the speed it was tuned at. Every rotation
 * now scales by how many of these reference frames have passed, and every lerp factor
 * `k` becomes `1 - (1 - k) ** f` (`ease`), the same easing at any rate. A 120 Hz screen
 * slows to the speed a 60 Hz one always had, which is visible and intended.
 */
const REFERENCE_MS = 1000 / 60
/** The frame governor: at most 60 fps, and 30 under `calm` or while the terminal's
 *  blurred panel is open, which re-composites its backdrop on every frame drawn. */
const FULL_FRAME_MS = 1000 / 60
const SLOW_FRAME_MS = 1000 / 30
/** Frames arrive a little early or late; one this close to due counts, or a 60 Hz screen
 *  would drop every other frame against a 60 fps cap. */
const FRAME_SLACK_MS = 2.5
/** How far one frame may advance the field, so a tab back from the background resumes
 *  rather than leaping. */
const MAX_STEP = 4
/** `calm`'s share of the field's speed. */
const CALM_SPEED = 0.35

/** The timestamp of the last frame drawn, or 0 when the loop has just (re)started. */
let lastFrame = 0
/**
 * When the governor next lets a frame through. Kept on a grid rather than counted from
 * the last frame, so a frame that arrives a little late doesn't push every later one
 * back with it: jitter never drops a frame, and the long-run rate is still the cap.
 */
let nextDue = 0

/** A lerp factor tuned per reference frame, for a frame `f` reference frames long. */
function ease(k: number, f: number): number {
  return 1 - (1 - k) ** f
}

let stopScreensaver: (() => void) | null = null

let mouseX = 0
let mouseY = 0
let pointerActive = false
let pointerIdleTimer: ReturnType<typeof setTimeout> | undefined

/** The four hue slots a palette picks from, by their historical names (§3: under Gruvbox
 *  `green` is orange). */
type Hue = 'green' | 'cyan' | 'purple' | 'pink'
const HUES: readonly Hue[] = ['green', 'cyan', 'purple', 'pink']
/** What each slot reads when the property is empty, the default's own hex. */
const HUE_FALLBACKS: Record<Hue, string> = { green: '#00ff41', cyan: '#00ffff', purple: '#bf00ff', pink: '#ff0080' }

function hueColours(): Record<Hue, THREE.Color> {
  return { green: new THREE.Color(), cyan: new THREE.Color(), purple: new THREE.Color(), pink: new THREE.Color() }
}

/** The four hues as the wireframes paint them right now — the stylesheet's, or a `theme`'s. */
const neon = hueColours()
/**
 * A scheme switch eases the wireframes from the hues on screen (`neonFrom`) to the new
 * ones (`neonTo`) over `RECOLOUR_MS`, in the loop. Preallocated, so the lerp allocates
 * nothing; with no loop running (`paused`) the switch is still the instant recolour.
 */
const neonFrom = hueColours()
const neonTo = hueColours()
/** Matches the theme circle, so the field and the page land on the new scheme together. */
const RECOLOUR_MS = 450
/** How far through the current ease, 0 → 1. At rest it is 1. */
let recolour = 1

interface Palette {
  base: Hue
  accent: Hue
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

/** The other views get a mood of their own, the way each section does. Anything not
 *  listed here (the 404, say) falls back to the section palette below. */
const VIEW_PALETTES: Record<string, Palette> = {
  tools: { base: 'cyan', accent: 'purple', speed: 1.1 },
  watch: { base: 'pink', accent: 'cyan', speed: 0.9 },
  radio: { base: 'purple', accent: 'green', speed: 1.2 },
}

/** The reward for finding everything: a palette no section can produce. */
const COMPLETIONIST_PALETTE: Palette = { base: 'pink', accent: 'cyan', speed: 1.35 }

let sectionSpeed = 1

/** Constellation lines, built lazily the first time they're switched on. */
let links: THREE.LineSegments | null = null
let linkPositions: Float32Array | null = null

/** The shape the camera is currently drawn to, and when to let go. */
let focused: AnimatedShape | null = null
let focusUntil = 0

// Scratch vectors, reused every frame so the render loop stays allocation-free.
const pointerWorld = new THREE.Vector3()
const target = new THREE.Vector3()
const lookTarget = new THREE.Vector3()
const pointerNdc = new THREE.Vector2()
const raycaster = new THREE.Raycaster()
const ORIGIN = new THREE.Vector3(0, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const worldPosition = new THREE.Vector3()
/** Set on a swing's first frame, cleared by the bake on its last. */
let swingArmed = false

function handleMouseMove(event: MouseEvent) {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1
  mouseY = (event.clientY / window.innerHeight) * 2 - 1
  pointerActive = true
  clearTimeout(pointerIdleTimer)
  pointerIdleTimer = setTimeout(() => {
    pointerActive = false
  }, POINTER_IDLE_MS)
}


/** Half the visible world at the z=0 plane — the frustum maths the spread and the
 *  pointer projection both need. */
function halfExtents(aspect: number): { x: number; y: number } {
  const y = Math.tan(((FOV * Math.PI) / 180) / 2) * cameraBaseZ
  return { x: y * aspect, y }
}

function currentPalette(): Palette {
  if (unlocked.value.has('completionist')) return COMPLETIONIST_PALETTE
  const view = activeView.value
  if (view !== 'home' && VIEW_PALETTES[view]) return VIEW_PALETTES[view]
  return SECTION_PALETTES[activeSection.value] ?? SECTION_PALETTES.about!
}

/** The colour half of `applyPalette`: every material takes its hue from `neon` as it
 *  stands. The loop calls this alone on each frame of a scheme's ease. */
function applyColours() {
  const palette = currentPalette()
  for (const { mesh, accent } of shapes) {
    ;(mesh.material as THREE.MeshBasicMaterial).color.copy(neon[accent ? palette.accent : palette.base])
  }
  for (const shape of visitors) (shape.mesh.material as THREE.MeshBasicMaterial).color.copy(neon[palette.base])
  if (links) (links.material as THREE.LineBasicMaterial).color.copy(neon[palette.base])
}

/** Recolours the existing materials in place — cheaper than rebuilding the scene,
 *  and the shapes keep their positions across a section change. */
function applyPalette() {
  sectionSpeed = currentPalette().speed
  applyColours()

  const mood = weatherMood.value
  for (const { mesh, baseOpacity } of shapes) {
    // Scaled from `baseOpacity` rather than from the current value, so a run of
    // weather changes can't ratchet every shape down to invisible.
    ;(mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(baseOpacity * mood.opacity, 0.6)
  }
  for (const shape of visitors) (shape.mesh.material as THREE.MeshBasicMaterial).opacity = visitorOpacity(shape)

  // Nothing is redrawing on its own while motion is paused.
  if (animationFrameId === null && renderer && scene && camera) renderer.render(scene, camera)
}

/** One frame of a scheme's ease, `dt` milliseconds long. Smoothstepped, so the new
 *  colour arrives without a jolt at either end. */
function easeColours(dt: number) {
  recolour = Math.min(1, recolour + dt / RECOLOUR_MS)
  const k = recolour * recolour * (3 - 2 * recolour)
  for (let i = 0; i < HUES.length; i++) {
    const hue = HUES[i]!
    neon[hue].copy(neonFrom[hue]).lerp(neonTo[hue], k)
  }
  applyColours()
}

/** A fresh position from the spawn distribution, in the field's own axes — the same
 *  distribution `addShape` uses and the swing re-homes to, so the scene never drifts
 *  toward a composition the opening one could not have produced. */
function sampleHome(out: THREE.Vector3): THREE.Vector3 {
  const spread = camera ? halfExtents(camera.aspect).x * 2 : 20
  return out.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 12)
}

function addShape(accent: boolean, pool: AnimatedShape[] = shapes) {
  if (!field || !camera) return

  const kind = KINDS[Math.floor(Math.random() * KINDS.length)]!
  const palette = currentPalette()
  const baseOpacity = 0.15 + Math.random() * 0.25
  const material = new THREE.MeshBasicMaterial({
    color: neon[accent ? palette.accent : palette.base],
    wireframe: true,
    transparent: true,
    opacity: baseOpacity * weatherMood.value.opacity,
  })
  const mesh = new THREE.Mesh(kind.make(), material)

  const home = sampleHome(new THREE.Vector3())
  mesh.position.copy(home)
  mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)

  field.add(mesh)
  const shape: AnimatedShape = {
    mesh,
    home,
    offset: new THREE.Vector3(),
    accent,
    baseOpacity,
    kind,
    speed: {
      x: (Math.random() - 0.5) * 0.006,
      y: (Math.random() - 0.5) * 0.006,
      z: (Math.random() - 0.5) * 0.004,
    },
  }
  pool.push(shape)
  if (pool === shapes) meshes.push(mesh)
  else {
    // Invisible until the loop fades it in; at full straight away when nothing loops.
    shape.presence = { level: animationFrameId === null ? 1 : 0, leaving: false }
    material.opacity = visitorOpacity(shape)
  }
}

function disposeShape(shape: AnimatedShape) {
  if (focused === shape) focused = null
  field?.remove(shape.mesh)
  shape.mesh.geometry.dispose()
  ;(shape.mesh.material as THREE.Material).dispose()
}

/** A visitor's opacity: what any shape would have under this weather, times its fade. */
function visitorOpacity(shape: AnimatedShape): number {
  return Math.min(shape.baseOpacity * weatherMood.value.opacity, 0.6) * (shape.presence?.level ?? 1)
}

/**
 * Brings the visitor pool to `visitorShapes`: arrivals are added at zero opacity, and
 * departures are marked rather than removed, so the loop can fade them out. A
 * departure still fading is taken back first if someone else arrives.
 */
function syncVisitors() {
  const wanted = visitorShapes.value
  const staying = () => visitors.filter((v) => !v.presence!.leaving)
  for (const shape of visitors) {
    if (shape.presence!.leaving && staying().length < wanted) shape.presence!.leaving = false
  }
  while (staying().length < wanted) addShape(false, visitors)
  const present = staying()
  for (let i = present.length - 1; i >= wanted; i--) present[i]!.presence!.leaving = true

  // With no loop running there is no fade: settle the pool now.
  if (animationFrameId === null) {
    for (let i = visitors.length - 1; i >= 0; i--) {
      if (visitors[i]!.presence!.leaving) disposeShape(visitors.splice(i, 1)[0]!)
    }
    if (renderer && scene && camera) renderer.render(scene, camera)
  }
}

/** One frame of the visitors' fades, `k` of the way; removes whoever has finished leaving. */
function fadeVisitors(k: number) {
  for (let i = visitors.length - 1; i >= 0; i--) {
    const shape = visitors[i]!
    const presence = shape.presence!
    presence.level += ((presence.leaving ? 0 : 1) - presence.level) * k
    if (presence.leaving && presence.level < 0.01) {
      disposeShape(visitors.splice(i, 1)[0]!)
      continue
    }
    ;(shape.mesh.material as THREE.MeshBasicMaterial).opacity = visitorOpacity(shape)
  }
}

function removeShape() {
  const shape = shapes.pop()
  meshes.pop()
  if (shape) disposeShape(shape)
}

/** Brings the scene to `shapeCount`, adding or removing one at a time. */
function syncShapeCount() {
  const wanted = shapeCount.value
  while (shapes.length < wanted) addShape(Math.random() < ACCENT_CHANCE)
  while (shapes.length > wanted) removeShape()
  if (animationFrameId === null && renderer && scene && camera) renderer.render(scene, camera)
}

/**
 * Reads the four hues the stylesheet paints into `into`. Under the default they are
 * `:root`'s hex (`#00ff41`, …), not the table's `oklch()` primary, accent and secondary,
 * which are close but not the same colour, and which `THREE.Color` can't parse: reading
 * the computed property is what keeps an ease starting from the colour actually on screen.
 */
function readNeon(into: Record<Hue, THREE.Color>) {
  const style = getComputedStyle(document.documentElement)
  for (let i = 0; i < HUES.length; i++) {
    const hue = HUES[i]!
    into[hue].set(style.getPropertyValue(`--neon-${hue}`).trim() || HUE_FALLBACKS[hue])
  }
}

function createInitialShapes() {
  readNeon(neon)

  // Exactly three accents in the opening scene, so "not all of them are the same
  // colour" is a fact rather than a probability.
  const accentIndices = new Set<number>()
  while (accentIndices.size < accentSeeds) {
    accentIndices.add(Math.floor(Math.random() * shapeCount.value))
  }
  for (let i = 0; i < shapeCount.value; i++) addShape(accentIndices.has(i))

  applyPalette()
}

/** Allocated once for the largest scene `spawn` allows, then drawn with
 *  `setDrawRange` — reallocating a buffer every frame would undo the point of
 *  keeping the loop allocation-free, and sizing it to the *current* shape count
 *  would silently truncate the lines the moment someone spawns more. */
function ensureLinks() {
  if (links || !field) return

  const maxPairs = (MAX_SHAPE_COUNT * (MAX_SHAPE_COUNT - 1)) / 2
  linkPositions = new Float32Array(maxPairs * 6)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(linkPositions, 3))
  links = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: neon.green,
      transparent: true,
      opacity: 0.12,
    }),
  )
  // In the field, not the scene: the positions it is fed are the shapes' field-local
  // ones, and it has to turn with them.
  field.add(links)
  applyPalette()
}

function disposeLinks() {
  if (!links) return
  field?.remove(links)
  links.geometry.dispose()
  ;(links.material as THREE.Material).dispose()
  links = null
  linkPositions = null
}

function updateLinks() {
  if (!links || !linkPositions) return

  const capacity = linkPositions.length / 6
  let pair = 0
  for (let i = 0; i < shapes.length && pair < capacity; i++) {
    const a = shapes[i]!.mesh.position
    for (let j = i + 1; j < shapes.length && pair < capacity; j++) {
      const b = shapes[j]!.mesh.position
      if (a.distanceTo(b) > LINK_DISTANCE) continue

      linkPositions.set([a.x, a.y, a.z, b.x, b.y, b.z], pair * 6)
      pair++
    }
  }

  links.geometry.setDrawRange(0, pair * 2)
  links.geometry.attributes.position!.needsUpdate = true
}

/** Ignores clicks that belong to the page — a link, a control, or a drag that
 *  selected text. Everything else over the background is fair game. */
function isPageClick(event: MouseEvent): boolean {
  if (terminalOpen.value) return true
  if (window.getSelection()?.toString()) return true

  const target = event.target as HTMLElement | null
  return Boolean(
    target?.closest('a, button, input, textarea, select, label, [role="button"], [role="dialog"]'),
  )
}

function handleClick(event: MouseEvent) {
  if (!camera || isPageClick(event)) return

  pointerNdc.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1,
  )
  raycaster.setFromCamera(pointerNdc, camera)

  const hit = raycaster.intersectObjects([...meshes, ...visitors.map((v) => v.mesh)], false)[0]
  if (!hit) return

  const shape = shapes.find((s) => s.mesh === hit.object) ?? visitors.find((v) => v.mesh === hit.object)
  if (!shape) return

  focused = shape
  focusUntil = performance.now() + FOCUS_MS

  inspected.value = {
    text: shape.presence
      ? `${shape.kind.label} · ${t(m.scene.visitor)}`
      : shape.accent
        ? `${shape.kind.label} · accent`
        : shape.kind.label,
    x: event.clientX,
    y: event.clientY,
  }
  clearTimeout(inspectTimer)
  inspectTimer = setTimeout(() => {
    inspected.value = null
  }, FOCUS_MS)

  // Three of eighteen are a different colour. Noticing that, and then acting on
  // it, is the whole achievement.
  if (shape.accent) unlock('cyanSpotter')
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

/**
 * The first frame of a swing. Every shape draws a new home so the field lands in a
 * fresh composition — but the mesh must not jump, so the offset absorbs the difference
 * and the existing `offset.lerp(target)` drifts it there over the swing (§5.3: "let go
 * is just a zero target, not a special case"). The new home is expressed in the frame
 * the bake will leave behind: rotated by the *inverse* of the swing's final yaw, so
 * that once the bake rotates everything forward again it sits exactly where the
 * distribution put it.
 */
function rehome() {
  const finalYaw = -swingDirection.value * FIELD_YAW
  forEachShape((shape) => {
    sampleHome(worldPosition).applyAxisAngle(Y_AXIS, -finalYaw)
    shape.offset.add(shape.home).sub(worldPosition)
    shape.home.copy(worldPosition)
  })
}

/**
 * The last frame of a swing. Rotating home and offset by the field's rotation and
 * zeroing the rotation is a visual no-op — and it restores the invariant that
 * `halfExtents`, the pointer projection and the gravity well all assume: camera on
 * +z, field facing it, positions in world axes. Without it every route change would
 * leave the well a little more wrong.
 */
function bake() {
  if (!field) return
  const yaw = field.rotation.y
  forEachShape((shape) => {
    shape.home.applyAxisAngle(Y_AXIS, yaw)
    shape.offset.applyAxisAngle(Y_AXIS, yaw)
  })
  field.rotation.y = 0
}

function animate(now: number) {
  animationFrameId = requestAnimationFrame(animate)

  const calm = motion.value === 'calm'
  const budget = calm || terminalOpen.value ? SLOW_FRAME_MS : FULL_FRAME_MS
  if (now < nextDue - FRAME_SLACK_MS) return
  // Far behind (a tab back from the background), the grid starts again from here
  // rather than letting frames through back to back to catch up.
  nextDue = now > nextDue + budget ? now + budget : nextDue + budget
  const f = lastFrame ? Math.min(MAX_STEP, (now - lastFrame) / REFERENCE_MS) : 1
  lastFrame = now

  const boost = speedMultiplier.value * sectionSpeed * weatherMood.value.speed * (calm ? CALM_SPEED : 1) * f
  const shaking = glitching.value
  const turning = swinging.value
  // The well's z=0-plane maths is wrong in a rotated frame; off for the 650 ms. `calm`
  // has no pointer pull at all: neither the well nor the camera follows the cursor.
  const pulling = pointerActive && gravityOn.value && !turning && !calm

  if (field) {
    if (turning) {
      if (!swingArmed) {
        rehome()
        swingArmed = true
      }
      field.rotation.y = -swingDirection.value * FIELD_YAW * swing.value
    } else if (swingArmed) {
      bake()
      swingArmed = false
    }
  }

  if (camera && pulling) {
    const half = halfExtents(camera.aspect)
    pointerWorld.set(mouseX * half.x, -mouseY * half.y, 0)
  }

  fadeVisitors(ease(VISITOR_FADE, f))
  if (recolour < 1) easeColours(f * REFERENCE_MS)
  // Snap during a glitch, drift the rest of the time.
  const drift = ease(shaking ? 0.65 : 0.045, f)
  forEachShape(({ mesh, speed, home, offset }) => {
    mesh.rotation.x += speed.x * boost
    mesh.rotation.y += speed.y * boost
    mesh.rotation.z += speed.z * boost

    target.set(0, 0, 0)

    // Pointer gravity well: everything inside the radius leans toward the cursor,
    // hardest at the centre. Outside it — or once the pointer goes idle, or once
    // `gravity off` is run — the target is zero and the shape eases back home.
    if (pulling) {
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

    offset.lerp(target, drift)
    mesh.position.copy(home).add(offset)
  })

  if (constellationOn.value) updateLinks()

  if (camera) {
    const targetX = calm ? 0 : mouseX * 0.6
    const targetY = calm ? 0 : -mouseY * 0.4
    const follow = ease(0.03, f)
    camera.position.x += (targetX - camera.position.x) * follow
    camera.position.y += (targetY - camera.position.y) * follow
    camera.position.z = cameraBaseZ + (turning ? DOLLY * Math.sin(Math.PI * swing.value) : 0)

    // An inspected shape draws the camera's gaze for a couple of seconds, then
    // the origin takes it back — easing both ways, so nothing ever snaps. World
    // position, because a mesh's own position is field-local while the field turns.
    if (focused && performance.now() > focusUntil) focused = null
    lookTarget.lerp(focused ? focused.mesh.getWorldPosition(worldPosition) : ORIGIN, ease(0.04, f))
    camera.lookAt(lookTarget)
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

/** Starts the loop, the pointer and the screensaver — on mount, and when motion comes
 *  back from `paused`. */
function startLoop() {
  if (animationFrameId !== null || !renderer) return
  lastFrame = 0
  nextDue = 0
  animationFrameId = requestAnimationFrame(animate)
  window.addEventListener('mousemove', handleMouseMove)
  stopScreensaver ??= startScreensaver()
}

/**
 * `paused`: the loop stops and one frame is drawn as the scene stands. The screensaver
 * stops with it — it hands the screen to a field that no longer moves. A swing caught
 * halfway is finished and baked first, so the still frame is not a field turned askew.
 */
function pauseLoop() {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
  animationFrameId = null
  window.removeEventListener('mousemove', handleMouseMove)
  pointerActive = false
  stopScreensaver?.()
  stopScreensaver = null
  if (swingArmed && field) {
    field.rotation.y = -swingDirection.value * FIELD_YAW
    bake()
    swingArmed = false
  }
  if (camera) camera.position.z = cameraBaseZ
  // Nor will a scheme's ease: the still frame is in the new colours.
  if (recolour < 1) easeColours(RECOLOUR_MS)
  // No fade will finish now: whoever is arriving is here, and whoever is leaving goes
  // (`syncVisitors` disposes them when nothing loops, and draws the frame).
  for (const shape of visitors) {
    if (shape.presence!.leaving) continue
    shape.presence!.level = 1
    ;(shape.mesh.material as THREE.MeshBasicMaterial).opacity = visitorOpacity(shape)
  }
  syncVisitors()
}

watch(motion, (level) => (level === 'paused' ? pauseLoop() : startLoop()))

// Both the section and the completionist unlock change how the scene looks; one
// watcher covers them because `currentPalette()` already knows which wins.
// The weather rides along on the same watcher: it only ever scales what the
// palette already decided, so there is nothing for it to apply separately.
watch([activeSection, activeView, unlocked, weatherMood], applyPalette)
// A scheme changes what the palette's names mean, not which names it picks — so the
// same recolour, after re-reading the hues. `useTheme` has already written the new
// properties by the time this runs (inside the view transition's callback, when the
// circle runs). With the loop running the wireframes ease there; paused, they jump.
watch(theme, () => {
  if (animationFrameId === null) {
    readNeon(neon)
    applyPalette()
    return
  }
  for (let i = 0; i < HUES.length; i++) neonFrom[HUES[i]!].copy(neon[HUES[i]!])
  readNeon(neonTo)
  recolour = 0
})
watch(shapeCount, syncShapeCount)
watch(visitorShapes, syncVisitors)
watch(constellationOn, (on) => (on ? ensureLinks() : disposeLinks()))

onMounted(() => {
  if (!canvasRef.value) return

  try {
    scene = new THREE.Scene()
    field = new THREE.Group()
    field.position.z = FIELD_DEPTH
    scene.add(field)
    camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.z = cameraBaseZ

    renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)

    createInitialShapes()
    if (constellationOn.value) ensureLinks()
    syncVisitors()
  } catch (error) {
    console.warn('ThreeBackground: WebGL unavailable, skipping animated background.', error)
    return
  }

  if (!renderer || !scene || !camera) return

  // The screensaver starts with the loop, so only once there is a field to hand the
  // screen to: a failed WebGL context returns above. The level can have gone back to
  // `paused` between the idle callback that mounted this and now.
  if (motion.value === 'paused') renderer.render(scene, camera)
  else startLoop()

  window.addEventListener('resize', handleResize)
  window.addEventListener('click', handleClick)

  // One request, from the surface that actually reacts to the answer. This
  // component is never mounted while motion is paused, so the call is not made
  // for a scene that would sit still anyway.
  void fetchWeather()
})

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  clearTimeout(pointerIdleTimer)
  clearTimeout(inspectTimer)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('click', handleClick)

  stopScreensaver?.()
  stopScreensaver = null
  disposeLinks()
  while (shapes.length) removeShape()
  while (visitors.length) disposeShape(visitors.pop()!)

  renderer?.forceContextLoss()
  renderer?.dispose()
  renderer = null
  scene = null
  field = null
  camera = null
  swingArmed = false
  lastFrame = 0
  nextDue = 0
})
</script>

<template>
  <canvas ref="canvasRef" class="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true"></canvas>

  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition duration-300 ease-in"
    leave-to-class="opacity-0"
  >
    <div
      v-if="inspected"
      class="fixed z-[60] -translate-x-1/2 -translate-y-full pointer-events-none rounded border border-primary/40 bg-background/90 backdrop-blur px-2 py-1 font-mono text-[11px] text-primary whitespace-nowrap"
      :style="{ left: `${inspected.x}px`, top: `${inspected.y - 8}px` }"
      aria-hidden="true"
    >
      {{ inspected.text }}
    </div>
  </Transition>

  <!-- Kept visible through the screensaver's fade (see main.css), so the page never
       looks like it has simply broken. -->
  <Transition
    enter-active-class="transition duration-700 delay-1000 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition duration-150"
    leave-to-class="opacity-0"
  >
    <p
      v-if="screensaver"
      data-screensaver-keep
      data-testid="screensaver-hint"
      class="fixed inset-x-0 bottom-8 text-center font-mono text-xs text-muted-foreground/70 pointer-events-none"
    >
      {{ t(m.scene.wake) }}
    </p>
  </Transition>
</template>
