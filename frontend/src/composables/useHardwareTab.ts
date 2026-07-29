import { ref } from 'vue'

export type HardwareTab = 'pc' | 'nas' | 'peripherals'

/** Shared so `hardware <tab>` in the terminal can drive the section's tab strip. */
export const hardwareTab = ref<HardwareTab>('pc')

export function isHardwareTab(value: string): value is HardwareTab {
  return value === 'pc' || value === 'nas' || value === 'peripherals'
}
