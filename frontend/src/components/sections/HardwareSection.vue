<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type MachineCategory = 'pc' | 'nas'

interface Spec {
  key: string
  value: string
}

interface Machine {
  name: string
  category: MachineCategory
  os: string
  specs: Spec[]
}

const machines: Machine[] = [
  {
    name: 'Dragonfly',
    category: 'pc',
    os: 'Tiny 11 25H2',
    specs: [
      { key: 'Motherboard', value: 'Gigabyte B850 GAMING X WIFI6E' },
      { key: 'CPU',         value: 'AMD Ryzen 7 9800X3D (4.7 / 5.2 GHz)' },
      { key: 'Cooling',     value: 'MSI MAG CORELIQUID A13 360 Black' },
      { key: 'GPU',         value: 'MSI GeForce RTX 5080 16G VENTUS 3X OC' },
      { key: 'RAM',         value: '32 GB DDR5 6000 MHz CL30 (2×16 GB)' },
      { key: 'SSD',         value: 'Samsung 990 EVO Plus 2TB NVMe' },
      { key: 'PSU',         value: 'Corsair RM1000x Gold' },
      { key: 'Case',        value: 'Corsair 3000D Airflow (Black)' },
    ],
  },
  {
    name: 'Hephaistos',
    category: 'pc',
    os: 'Arch Linux',
    specs: [
      { key: 'Model',  value: 'ASUS ROG Strix G16 (2020)' },
      { key: 'CPU',    value: 'Intel i7-9750H (2.6 / 4.5 GHz)' },
      { key: 'GPU',    value: 'GeForce GTX 1650 4G' },
      { key: 'RAM',    value: '32 GB DDR4 2666 MHz' },
      { key: 'SSD',    value: '1 TB NVMe' },
      { key: 'Case',   value: 'Laptop' },
    ],
  },
  {
    name: 'Poseidon',
    category: 'nas',
    os: 'TrueNAS CE',
    specs: [
      { key: 'Model',       value: 'MSI MEG Trident X 10th' },
      { key: 'Motherboard', value: 'MSI MEG Z490I UNIFY' },
      { key: 'CPU',         value: 'Intel i7-10700K (3.8 / 5.1 GHz)' },
      { key: 'GPU',         value: 'MSI RTX 3080 GAMING X TRIO 10G' },
      { key: 'RAM',         value: '16 GB DDR4 2933 MHz' },
      { key: 'SSD',         value: 'WD SN730 1TB NVMe' },
      { key: 'HDD',         value: 'Seagate Barracuda 1TB' },
      { key: 'PSU',         value: 'Modular 650W 80+ Gold' },
    ],
  },
  {
    name: 'Optimus',
    category: 'nas',
    os: 'TrueNAS CE',
    specs: [
      { key: 'Model', value: 'Dell Optiplex 990 SFF' },
      { key: 'CPU',   value: 'Intel i7-2600 (3.6 GHz)' },
      { key: 'RAM',   value: '16 GB DDR3 1333 MHz (4×4 GB)' },
      { key: 'SSD',   value: 'Crucial M500 480 GB' },
    ],
  },
  {
    name: 'Azazel',
    category: 'nas',
    os: 'TrueNAS CE',
    specs: [
      { key: 'Motherboard', value: 'Z97 MPOWER MAX AC' },
      { key: 'CPU',         value: 'Intel i7-4770K (3.5 GHz)' },
      { key: 'GPU',         value: 'GeForce GTX 1060 3G' },
      { key: 'RAM',         value: '16 GB DDR3 1866 MHz (2×8 GB)' },
      { key: 'SSD',         value: 'Crucial M500 480 GB' },
    ],
  },
]

const peripherals = [
  { key: 'Monitor',   value: '49" Samsung Odyssey G9 G95T — Dual-QHD 240 Hz' },
  { key: 'Keyboard',  value: 'Keychron Q6 Pro (Brown switches)' },
  { key: 'Mouse',     value: 'Logitech G502 X' },
  { key: 'Mic',       value: 'Shure MV7X' },
  { key: 'Mixer',     value: 'Behringer Xenyx X1204 USB' },
  { key: 'Headset',   value: 'Beyerdynamic DT 990' },
  { key: 'Amp',       value: 'FiiO K5 Pro' },
  { key: 'Speaker',   value: 'Marshall Stanmore' },
  { key: 'Webcam',    value: 'Logitech C920' },
  { key: 'Internet',  value: 'Free Telecom FR — ↓ 8 Gbps / ↑ 8 Gbps' },
  { key: 'NIC',       value: 'QNAP QNA-T310G1S (10G)' },
]

const activeTab = ref<MachineCategory | 'peripherals'>('pc')

const pcs = machines.filter(m => m.category === 'pc')
const nas = machines.filter(m => m.category === 'nas')

const osColor: Record<string, string> = {
  'Tiny 11 25H2':  'text-blue-400 border-blue-400/40',
  'Arch Linux':    'text-cyan-400 border-cyan-400/40',
  'TrueNAS CE':    'text-secondary border-secondary/40',
}
</script>

<template>
  <section id="hardware" class="py-20 pt-24">
    <div class="max-w-5xl mx-auto px-4">
      <div class="mb-10">
        <p class="text-muted-foreground text-sm mb-1">
          <span class="text-primary">couvbat</span><span class="text-muted-foreground">:~$</span>
          <span class="ml-2 text-foreground">neofetch --all</span>
        </p>
        <h2 class="text-2xl md:text-3xl font-bold glow-cyan text-accent">
          <span class="text-accent">#</span> Hardware
        </h2>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mb-6 border-b border-border">
        <button
          v-for="tab in ([
            { id: 'pc',          label: 'PCs (×2)' },
            { id: 'nas',         label: 'NAS (×3)' },
            { id: 'peripherals', label: 'Peripherals' },
          ] as const)"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-2 text-sm font-mono transition-colors border-b-2 -mb-px',
            activeTab === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- PCs -->
      <div v-if="activeTab === 'pc'" class="grid gap-4 md:grid-cols-2">
        <Card
          v-for="m in pcs"
          :key="m.name"
          class="bg-card border-border overflow-hidden border-glow"
        >
          <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span class="ml-3 text-xs text-muted-foreground font-mono flex-1">{{ m.name.toLowerCase() }}@pc</span>
            <Badge variant="outline" :class="['text-xs', osColor[m.os] ?? 'text-muted-foreground']">
              {{ m.os }}
            </Badge>
          </div>
          <CardContent class="p-4 font-mono text-xs space-y-1.5">
            <div
              v-for="s in m.specs"
              :key="s.key"
              class="flex gap-2"
            >
              <span class="text-primary w-24 shrink-0">{{ s.key }}</span>
              <span class="text-muted-foreground">→</span>
              <span class="text-foreground">{{ s.value }}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- NAS -->
      <div v-if="activeTab === 'nas'" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          v-for="m in nas"
          :key="m.name"
          class="bg-card border-border overflow-hidden"
          style="box-shadow: 0 0 8px rgba(191,0,255,0.15);"
        >
          <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span class="ml-3 text-xs text-muted-foreground font-mono flex-1">{{ m.name.toLowerCase() }}@nas</span>
            <Badge variant="outline" :class="['text-xs', osColor[m.os] ?? 'text-muted-foreground']">
              {{ m.os }}
            </Badge>
          </div>
          <CardContent class="p-4 font-mono text-xs space-y-1.5">
            <div
              v-for="s in m.specs"
              :key="s.key"
              class="flex gap-2"
            >
              <span class="text-secondary w-24 shrink-0">{{ s.key }}</span>
              <span class="text-muted-foreground">→</span>
              <span class="text-foreground">{{ s.value }}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Peripherals -->
      <div v-if="activeTab === 'peripherals'">
        <Card class="bg-card border-border overflow-hidden border-glow-cyan">
          <div class="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span class="ml-3 text-xs text-muted-foreground">peripherals.conf</span>
          </div>
          <CardContent class="p-4 font-mono text-xs">
            <div class="grid gap-2 sm:grid-cols-2">
              <div
                v-for="p in peripherals"
                :key="p.key"
                class="flex gap-2"
              >
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
