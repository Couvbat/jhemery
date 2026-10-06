import { ref } from 'vue'

/**
 * Whether the Ctrl+K palette is open. Out here rather than inside `CommandPalette.vue`
 * so `usePageFocus` can leave focus alone while it is, without importing a component.
 */
export const paletteOpen = ref(false)
