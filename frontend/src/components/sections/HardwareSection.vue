<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import SectionHeader from '@/components/SectionHeader.vue'
import { nas, pcs, peripherals } from '@/content'
import { useLocale } from '@/i18n'
// Module-level so the terminal's `hardware nas` command can select a tab from outside.
import { hardwareTab as active } from '@/composables/useHardwareTab'

const { t, m } = useLocale()

const tabs = computed(() => [
  { id: 'pc' as const, label: `${t(m.hardware.pcs)} (×${pcs.length})` },
  { id: 'nas' as const, label: `${t(m.hardware.nas)} (×${nas.length})` },
  { id: 'peripherals' as const, label: t(m.hardware.peripherals) },
])

const osColor: Record<string, string> = {
  'Tiny 11 25H2': 'text-blue-400 border-blue-400/40',
  'Arch Linux': 'text-cyan-400 border-cyan-400/40',
  'TrueNAS CE': 'text-secondary border-secondary/40',
}
</script>

<template>
  <section id="hardware" class="py-20 pt-24">
    <div class="max-w-5xl mx-auto px-4">
      <SectionHeader section="hardware" tone="cyan" />

      <!-- Tabs -->
      <div class="flex gap-1 mb-6 border-b border-border">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="active = tab.id"
          :class="[
            'px-4 py-2 text-sm font-mono transition-colors border-b-2 -mb-px',
            active === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- PCs -->
      <div v-if="active === 'pc'" class="grid gap-4 md:grid-cols-2">
        <Card
          v-for="machine in pcs"
          :key="machine.name"
          class="bg-card border-border overflow-hidden border-glow gap-0 py-0"
        >
          <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span class="ml-3 text-xs text-muted-foreground font-mono flex-1"
              >{{ machine.name.toLowerCase() }}@pc</span
            >
            <Badge
              variant="outline"
              :class="['text-xs', osColor[machine.os] ?? 'text-muted-foreground']"
            >
              {{ machine.os }}
            </Badge>
          </div>
          <CardContent class="p-4 font-mono text-xs space-y-1.5">
            <div v-for="s in machine.specs" :key="s.key" class="flex gap-2">
              <span class="text-primary w-24 shrink-0">{{ s.key }}</span>
              <span class="text-muted-foreground">→</span>
              <span class="text-foreground">{{ s.value }}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- NAS -->
      <div v-if="active === 'nas'" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          v-for="machine in nas"
          :key="machine.name"
          class="bg-card border-border overflow-hidden gap-0 py-0"
          style="box-shadow: 0 0 8px rgba(191, 0, 255, 0.15)"
        >
          <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span class="ml-3 text-xs text-muted-foreground font-mono flex-1"
              >{{ machine.name.toLowerCase() }}@nas</span
            >
            <Badge
              variant="outline"
              :class="['text-xs', osColor[machine.os] ?? 'text-muted-foreground']"
            >
              {{ machine.os }}
            </Badge>
          </div>
          <CardContent class="p-4 font-mono text-xs space-y-1.5">
            <div v-for="s in machine.specs" :key="s.key" class="flex gap-2">
              <span class="text-secondary w-24 shrink-0">{{ s.key }}</span>
              <span class="text-muted-foreground">→</span>
              <span class="text-foreground">{{ s.value }}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Peripherals -->
      <div v-if="active === 'peripherals'">
        <Card class="bg-card border-border overflow-hidden border-glow-cyan gap-0 py-0">
          <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span class="ml-3 text-xs text-muted-foreground">peripherals.conf</span>
          </div>
          <CardContent class="p-4 font-mono text-xs">
            <div class="grid gap-2 sm:grid-cols-2">
              <div v-for="p in peripherals" :key="p.key" class="flex gap-2">
                <span class="text-accent w-20 shrink-0">{{ p.key }}</span>
                <span class="text-muted-foreground">→</span>
                <span class="text-foreground">{{ p.value }}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </section>
</template>
