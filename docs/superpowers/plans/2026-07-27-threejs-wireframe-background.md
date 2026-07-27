# Three.js Wireframe Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an animated, full-site fixed background made of simple wireframe 3D shapes (Three.js) behind all page content, matching the existing cyberpunk/neon-green terminal theme.

**Architecture:** A single new Vue component (`ThreeBackground.vue`) owns a Three.js scene rendered to a fixed, full-viewport, non-interactive `<canvas>`. It is mounted once in `App.vue`, before the router view, so it sits behind every section on every scroll position. The component is self-contained: it creates its own renderer/scene/camera on mount and fully tears them down on unmount.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API), TypeScript, Three.js (`three` + `@types/three`), Vite. No test framework is configured in `frontend/` (no test runner in `package.json`) — verification for this purely-visual feature is manual, via the Vite dev server in the browser preview, per the spec's explicit "hors périmètre" on automated tests.

## Global Constraints

- Background covers the **entire site** (fixed, visible across all sections while scrolling), not just the Hero section.
- Canvas must never intercept clicks or sit above content: `position: fixed; inset: 0; z-index: -1; pointer-events: none`.
- Colors: majority `--neon-green` (`#00ff41`), 2–3 shapes in `--neon-cyan` (`#00ffff`) for variety — both already defined in `frontend/src/assets/main.css`.
- 8–12 wireframe primitives, mixed from: `IcosahedronGeometry`, `TorusGeometry`, `BoxGeometry`, `OctahedronGeometry`.
- Each shape rotates continuously on its own axis/speed (small random variation per shape, not synchronized).
- Mouse parallax: camera position lerps toward normalized mouse position, subtle amplitude, no sudden jumps.
- Respect `prefers-reduced-motion: reduce`: render one static frame, skip the rotation/parallax animation loop entirely.
- Full cleanup on unmount: cancel animation frame, dispose geometries/materials/renderer, remove `resize`/`mousemove` listeners.
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` to cap cost on high-DPI screens.
- No new dependency beyond `three` (+ `@types/three` dev-only) — no `@react-three/fiber` or similar wrapper.

---

### Task 1: Add Three.js dependency

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `three` importable as `import * as THREE from 'three'` in later tasks; types available via `@types/three`.

- [ ] **Step 1: Install the packages**

Run:
```bash
cd frontend && npm install three && npm install -D @types/three
```
Expected: `frontend/package.json` gains `"three": "^<version>"` under `dependencies` and `"@types/three": "^<version>"` under `devDependencies`; `frontend/package-lock.json` updates.

- [ ] **Step 2: Verify the install**

Run: `cd frontend && npm ls three @types/three`
Expected: both packages listed with resolved versions, no `UNMET DEPENDENCY` errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "Add three.js dependency for animated background"
```

---

### Task 2: Create ThreeBackground.vue with static wireframe scene, mount in App

**Files:**
- Create: `frontend/src/components/ThreeBackground.vue`
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Consumes: `three` (Task 1), CSS custom properties `--neon-green` / `--neon-cyan` defined in `frontend/src/assets/main.css:105-107`.
- Produces: `ThreeBackground.vue` as a zero-prop, zero-emit component (`<ThreeBackground />`) that later tasks will extend with animation logic in the same file.

- [ ] **Step 1: Create the component with scene setup and static shapes**

```vue
<!-- frontend/src/components/ThreeBackground.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'

const canvasRef = ref<HTMLCanvasElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animationFrameId: number | null = null

const shapeCount = 10
const shapes: THREE.Mesh[] = []

function readNeonColor(varName: string, fallback: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return new THREE.Color(value || fallback)
}

function createShapes(targetScene: THREE.Scene) {
  const greenColor = readNeonColor('--neon-green', '#00ff41')
  const cyanColor = readNeonColor('--neon-cyan', '#00ffff')
  const geometries = [
    () => new THREE.IcosahedronGeometry(1, 0),
    () => new THREE.TorusGeometry(0.8, 0.3, 8, 24),
    () => new THREE.BoxGeometry(1.2, 1.2, 1.2),
    () => new THREE.OctahedronGeometry(1, 0),
  ]

  for (let i = 0; i < shapeCount; i++) {
    const geometry = geometries[i % geometries.length]()
    const isCyan = i % 4 === 3
    const material = new THREE.MeshBasicMaterial({
      color: isCyan ? cyanColor : greenColor,
      wireframe: true,
      transparent: true,
      opacity: 0.15 + Math.random() * 0.25,
    })
    const mesh = new THREE.Mesh(geometry, material)

    mesh.position.set(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 12 - 4,
    )
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)

    targetScene.add(mesh)
    shapes.push(mesh)
  }
}

function handleResize() {
  if (!camera || !renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

onMounted(() => {
  if (!canvasRef.value) return

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.z = 10

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)

  createShapes(scene)
  renderer.render(scene, camera)

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)

  shapes.forEach((mesh) => {
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  })
  shapes.length = 0

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
  ></canvas>
</template>
```

- [ ] **Step 2: Mount the component in App.vue**

```vue
<!-- frontend/src/App.vue -->
<script setup lang="ts">
import { RouterView } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import ThreeBackground from '@/components/ThreeBackground.vue'
</script>

<template>
  <ThreeBackground />
  <NavBar />
  <RouterView />
</template>
```

- [ ] **Step 3: Verify visually in the browser**

Run: `cd frontend && npm run dev` (or use the project's preview tooling), open the app in a browser.
Expected: a dark canvas background with ~10 faint green/cyan wireframe shapes (icosahedrons, toruses, cubes, octahedrons) scattered around, visible behind the terminal-window Hero content; scrolling down keeps the shapes visible behind Projects/Music/Gaming/Hardware/Contact sections; clicking buttons/links in the page still works (canvas doesn't intercept clicks).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ThreeBackground.vue frontend/src/App.vue
git commit -m "Add static Three.js wireframe background behind site content"
```

---

### Task 3: Animate continuous per-shape rotation

**Files:**
- Modify: `frontend/src/components/ThreeBackground.vue`

**Interfaces:**
- Consumes: `shapes: THREE.Mesh[]`, `renderer`/`scene`/`camera` module-level state from Task 2.
- Produces: a running `requestAnimationFrame` loop (`animationFrameId`) that later tasks (Task 4) will extend with parallax and reduced-motion gating.

- [ ] **Step 1: Give each shape its own rotation speed and add the animation loop**

Replace the `createShapes` loop body's mesh creation section (after `mesh.rotation.set(...)`) by attaching per-mesh speeds, and add a render loop:

```typescript
// inside createShapes, right after targetScene.add(mesh); shapes.push(mesh)
// add a userData bag with per-shape rotation speed
mesh.userData.rotationSpeed = {
  x: (Math.random() - 0.5) * 0.006,
  y: (Math.random() - 0.5) * 0.006,
  z: (Math.random() - 0.5) * 0.004,
}
```

```typescript
// new function, defined alongside handleResize
function animate() {
  animationFrameId = requestAnimationFrame(animate)

  shapes.forEach((mesh) => {
    const speed = mesh.userData.rotationSpeed as { x: number; y: number; z: number }
    mesh.rotation.x += speed.x
    mesh.rotation.y += speed.y
    mesh.rotation.z += speed.z
  })

  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}
```

Update `onMounted` to call `animate()` instead of the one-off `renderer.render(scene, camera)`:

```typescript
  createShapes(scene)
  animate()

  window.addEventListener('resize', handleResize)
```

Update `onUnmounted` to cancel the loop before disposing:

```typescript
onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  window.removeEventListener('resize', handleResize)
  // ...rest unchanged
```

- [ ] **Step 2: Verify visually in the browser**

Run: `cd frontend && npm run dev`, open the app.
Expected: shapes continuously and independently rotate (different axes/speeds, not synchronized); no visible stutter; browser dev tools show no console errors; CPU/GPU usage stays reasonable (no runaway frame queue — confirm via a quick check that only one `requestAnimationFrame` is scheduled at a time, e.g. no duplicate animation after a hot-reload).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ThreeBackground.vue
git commit -m "Animate wireframe shapes with continuous per-shape rotation"
```

---

### Task 4: Add mouse parallax, reduced-motion support, and finish cleanup

**Files:**
- Modify: `frontend/src/components/ThreeBackground.vue`

**Interfaces:**
- Consumes: `animate()`, `camera`, `handleResize` from Task 3.
- Produces: final public behavior of `ThreeBackground.vue` — no further tasks depend on its internals.

- [ ] **Step 1: Add mouse tracking and camera parallax**

Add module-level target/current mouse state and a listener, then apply parallax inside `animate`:

```typescript
// alongside other module-level state
let mouseX = 0
let mouseY = 0
let cameraBaseZ = 10

function handleMouseMove(event: MouseEvent) {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1
  mouseY = (event.clientY / window.innerHeight) * 2 - 1
}
```

Update `animate` to lerp the camera toward the mouse-derived offset:

```typescript
function animate() {
  animationFrameId = requestAnimationFrame(animate)

  shapes.forEach((mesh) => {
    const speed = mesh.userData.rotationSpeed as { x: number; y: number; z: number }
    mesh.rotation.x += speed.x
    mesh.rotation.y += speed.y
    mesh.rotation.z += speed.z
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
```

Register/unregister the listener in `onMounted`/`onUnmounted`:

```typescript
  window.addEventListener('resize', handleResize)
  window.addEventListener('mousemove', handleMouseMove)
```

```typescript
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('mousemove', handleMouseMove)
```

- [ ] **Step 2: Verify parallax visually**

Run: `cd frontend && npm run dev`, open the app, move the mouse across the window.
Expected: the whole shape field subtly shifts opposite/with the mouse (small amplitude, smooth easing, no sudden jumps), while rotation keeps running independently.

- [ ] **Step 3: Add `prefers-reduced-motion` support**

Guard the animation loop so it never starts when the user prefers reduced motion, rendering a single static frame instead:

```typescript
// replace the `createShapes(scene); animate()` lines in onMounted with:
  createShapes(scene)

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion) {
    renderer.render(scene, camera)
  } else {
    animate()
  }
```

- [ ] **Step 4: Verify reduced-motion behavior**

Run: enable "reduce motion" in the OS/browser accessibility settings (or in Chrome DevTools: Rendering tab → "Emulate CSS media feature prefers-reduced-motion" → `reduce`), reload the app.
Expected: shapes render in their initial scattered positions but do not rotate or parallax; no console errors. Re-disable the emulation afterward and confirm animation resumes on reload.

- [ ] **Step 5: Final full-cleanup check**

Read through `onUnmounted` and confirm it now removes both listeners (`resize`, `mousemove`), cancels the animation frame, disposes every shape's geometry and material, and disposes the renderer — matching this shape:

```typescript
onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('mousemove', handleMouseMove)

  shapes.forEach((mesh) => {
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  })
  shapes.length = 0

  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
})
```

- [ ] **Step 6: Run the frontend type check**

Run: `cd frontend && npm run type-check`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ThreeBackground.vue
git commit -m "Add mouse parallax and prefers-reduced-motion support to background"
```
