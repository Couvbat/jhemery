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
    const geometry = geometries[i % geometries.length]!()
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

    mesh.userData.rotationSpeed = {
      x: (Math.random() - 0.5) * 0.006,
      y: (Math.random() - 0.5) * 0.006,
      z: (Math.random() - 0.5) * 0.004,
    }
  }
}

function handleResize() {
  if (!camera || !renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

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

onMounted(() => {
  if (!canvasRef.value) return

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.z = 10

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)

  createShapes(scene)
  animate()

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
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
