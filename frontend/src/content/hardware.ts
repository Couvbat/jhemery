import type { Machine, Spec } from './types'

/** Hardware specs are model names and numbers — nothing to translate. */
export const machines: Machine[] = [
  {
    name: 'Dragonfly',
    category: 'pc',
    os: 'Tiny 11 25H2',
    specs: [
      { key: 'Motherboard', value: 'Gigabyte B850 GAMING X WIFI6E' },
      { key: 'CPU', value: 'AMD Ryzen 7 9800X3D (4.7 / 5.2 GHz)' },
      { key: 'Cooling', value: 'MSI MAG CORELIQUID A13 360 Black' },
      { key: 'GPU', value: 'MSI GeForce RTX 5080 16G VENTUS 3X OC' },
      { key: 'RAM', value: '32 GB DDR5 6000 MHz CL30 (2×16 GB)' },
      { key: 'SSD', value: 'Samsung 990 EVO Plus 2TB NVMe' },
      { key: 'PSU', value: 'Corsair RM1000x Gold' },
      { key: 'Case', value: 'Corsair 3000D Airflow (Black)' },
    ],
  },
  {
    name: 'Hephaistos',
    category: 'pc',
    os: 'Arch Linux',
    specs: [
      { key: 'Model', value: 'ASUS ROG Strix G16 (2020)' },
      { key: 'CPU', value: 'Intel i7-9750H (2.6 / 4.5 GHz)' },
      { key: 'GPU', value: 'GeForce GTX 1650 4G' },
      { key: 'RAM', value: '32 GB DDR4 2666 MHz' },
      { key: 'SSD', value: '1 TB NVMe' },
      { key: 'Case', value: 'Laptop' },
    ],
  },
  {
    name: 'Poseidon',
    category: 'nas',
    os: 'TrueNAS CE',
    specs: [
      { key: 'Model', value: 'MSI MEG Trident X 10th' },
      { key: 'Motherboard', value: 'MSI MEG Z490I UNIFY' },
      { key: 'CPU', value: 'Intel i7-10700K (3.8 / 5.1 GHz)' },
      { key: 'GPU', value: 'MSI RTX 3080 GAMING X TRIO 10G' },
      { key: 'RAM', value: '16 GB DDR4 2933 MHz' },
      { key: 'SSD', value: 'WD SN730 1TB NVMe' },
      { key: 'HDD', value: 'Seagate Barracuda 1TB' },
      { key: 'PSU', value: 'Modular 650W 80+ Gold' },
    ],
  },
  {
    name: 'Optimus',
    category: 'nas',
    os: 'TrueNAS CE',
    specs: [
      { key: 'Model', value: 'Dell Optiplex 990 SFF' },
      { key: 'CPU', value: 'Intel i7-2600 (3.6 GHz)' },
      { key: 'RAM', value: '16 GB DDR3 1333 MHz (4×4 GB)' },
      { key: 'SSD', value: 'Crucial M500 480 GB' },
    ],
  },
  {
    name: 'Azazel',
    category: 'nas',
    os: 'TrueNAS CE',
    specs: [
      { key: 'Motherboard', value: 'Z97 MPOWER MAX AC' },
      { key: 'CPU', value: 'Intel i7-4770K (3.5 GHz)' },
      { key: 'GPU', value: 'GeForce GTX 1060 3G' },
      { key: 'RAM', value: '16 GB DDR3 1866 MHz (2×8 GB)' },
      { key: 'SSD', value: 'Crucial M500 480 GB' },
    ],
  },
]

export const peripherals: Spec[] = [
  { key: 'Monitor', value: '49" Samsung Odyssey G9 G95T — Dual-QHD 240 Hz' },
  { key: 'Keyboard', value: 'Keychron Q6 Pro (Brown switches)' },
  { key: 'Mouse', value: 'Logitech G502 X' },
  { key: 'Mic', value: 'Shure MV7X' },
  { key: 'Mixer', value: 'Behringer Xenyx X1204 USB' },
  { key: 'Headset', value: 'Beyerdynamic DT 990' },
  { key: 'Amp', value: 'FiiO K5 Pro' },
  { key: 'Speaker', value: 'Marshall Stanmore' },
  { key: 'Webcam', value: 'Logitech C920' },
  { key: 'Internet', value: 'Free Telecom FR — ↓ 8 Gbps / ↑ 8 Gbps' },
  { key: 'NIC', value: 'QNAP QNA-T310G1S (10G)' },
]

export const pcs = machines.filter((m) => m.category === 'pc')
export const nas = machines.filter((m) => m.category === 'nas')
