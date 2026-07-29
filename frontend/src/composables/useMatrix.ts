import { computed, ref } from 'vue'

const active = ref(false)

export function showMatrix() {
  active.value = true
}

export function hideMatrix() {
  active.value = false
}

export function useMatrix() {
  return { matrixActive: computed(() => active.value), showMatrix, hideMatrix }
}
