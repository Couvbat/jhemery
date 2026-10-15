import type { Localised } from './types'

/**
 * The homelab behind the site, as `/lab` draws it (the lab map spec,
 * `docs/superpowers/specs/2026-10-15-lab-map-design.md`). This is what the lab *is*; the
 * snapshot the lab pushes to the API only says how it *is doing*, so the map is a correct
 * diagram with the feed off, the API down or the lab asleep.
 *
 * What may be said is the spec's table, and the rule for which services appear is the
 * owner's: **every service that isn't critical is on the map.** A critical service holds
 * personal data or secrets, is an admin console, or is reachable only over Tailscale,
 * and is neither a node here nor an id in the API's `LAB_NODES`, so nothing about it can
 * land anywhere. No addresses, hostnames, ports or versions, ever: product names and
 * roles only.
 *
 * Which machine runs which service (`on`) is a draft for the owner to confirm: the spec
 * leaves it open, and only Ollama on poseidon is settled.
 */

export type LabNodeKind = 'visitor' | 'edge' | 'host' | 'machine' | 'service' | 'private'

export interface LabNode {
  /** Lower-case: `poseidon`, `npm`. The key the snapshot uses, and `LAB_NODES` lists. */
  id: string
  kind: LabNodeKind
  name: string
  role: Localised
  /** Product names, as facts: `['Docker', 'Ollama']`. */
  stack: string[]
  /** Why it is there, for the node's detail. */
  why?: Localised
  /** A `why` topic (`content/decisions.ts`), linked as `?run=why <id>`. */
  decision?: string
  /** The `content/hardware.ts` machine it is, for its specs. */
  machine?: string
  /** The machine a service runs on: draws it inside that machine's card. */
  on?: string
  /** The tier it is drawn in, left to right along the request path. */
  tier: number
}

export type LabLinkKind = 'public' | 'tunnel' | 'restricted' | 'private' | 'push'

export interface LabLink {
  from: string
  to: string
  kind: LabLinkKind
  label?: Localised
}

export const labNodes: LabNode[] = [
  {
    id: 'visitor',
    kind: 'visitor',
    name: 'You',
    role: { en: 'A browser, anywhere', fr: 'Un navigateur, n’importe où' },
    stack: [],
    tier: 0,
  },
  {
    id: 'cloudflare',
    kind: 'edge',
    name: 'Cloudflare',
    role: { en: 'DNS, proxy, and the rule in front of the model', fr: 'DNS, proxy, et la règle devant le modèle' },
    stack: ['Cloudflare'],
    why: {
      en: 'Every request to the site, the API and the model meets Cloudflare first. For the model it is also the lock: one rule admits only the API and home, so the model’s address is no use to anyone else.',
      fr: 'Chaque requête vers le site, l’API et le modèle passe d’abord par Cloudflare. Pour le modèle, c’est aussi le verrou : une règle n’admet que l’API et la maison, donc l’adresse du modèle ne sert à personne d’autre.',
    },
    tier: 1,
  },
  {
    id: 'o2switch-site',
    kind: 'host',
    name: 'o2switch · site',
    role: { en: 'Apache, serving the built app', fr: 'Apache, qui sert l’application compilée' },
    stack: ['Apache', 'Vue', 'Vite'],
    why: {
      en: 'Static files on shared hosting in France: the whole app is built ahead of time, so the host only ever serves files.',
      fr: 'Des fichiers statiques sur un hébergement mutualisé en France : toute l’application est compilée d’avance, donc l’hébergeur ne fait que servir des fichiers.',
    },
    tier: 2,
  },
  {
    id: 'o2switch-api',
    kind: 'host',
    name: 'o2switch · API',
    role: { en: 'Passenger running NestJS', fr: 'Passenger qui fait tourner NestJS' },
    stack: ['Passenger', 'Node.js', 'NestJS'],
    why: {
      en: 'The API holds the snapshot the lab pushes and answers visitors from that copy. It never calls into the lab on anyone’s behalf.',
      fr: 'L’API garde l’instantané que le labo lui envoie et répond aux visiteurs depuis cette copie. Elle n’appelle jamais le labo pour le compte de qui que ce soit.',
    },
    decision: 'steam-proxy',
    tier: 2,
  },
  {
    id: 'tunnel',
    kind: 'edge',
    name: 'Cloudflare Tunnel',
    role: { en: 'The only way in from outside', fr: 'La seule entrée depuis l’extérieur' },
    stack: ['cloudflared', 'TrueNAS'],
    why: {
      en: 'An outbound tunnel from the NAS, so no port is open at home: Cloudflare reaches in through a connection the lab opened itself.',
      fr: 'Un tunnel sortant depuis le NAS, donc aucun port n’est ouvert à la maison : Cloudflare entre par une connexion que le labo a ouverte lui-même.',
    },
    tier: 2,
  },
  {
    id: 'npm',
    kind: 'service',
    name: 'Nginx Proxy Manager',
    role: { en: 'Sends each request to its service', fr: 'Envoie chaque requête à son service' },
    stack: ['Nginx Proxy Manager'],
    why: {
      en: 'Shown as the path a request takes, not as a console: its admin side is off the map.',
      fr: 'Montré comme le chemin d’une requête, pas comme une console : son côté administration n’est pas sur la carte.',
    },
    tier: 3,
  },
  {
    id: 'tailscale',
    kind: 'private',
    name: 'Tailscale',
    role: { en: 'Admin only, not reachable from here', fr: 'Administration seulement, inaccessible d’ici' },
    stack: ['Tailscale'],
    tier: 3,
  },
  {
    id: 'optimus',
    kind: 'machine',
    name: 'Optimus',
    role: { en: 'The small NAS: the services that watch and serve', fr: 'Le petit NAS : les services qui surveillent et servent' },
    stack: ['TrueNAS CE', 'Docker'],
    machine: 'Optimus',
    tier: 4,
  },
  {
    id: 'poseidon',
    kind: 'machine',
    name: 'Poseidon',
    role: { en: 'The GPU NAS: the model and its interface', fr: 'Le NAS à GPU : le modèle et son interface' },
    stack: ['TrueNAS CE', 'Docker', 'NVIDIA'],
    machine: 'Poseidon',
    tier: 4,
  },
  {
    id: 'umami',
    kind: 'service',
    name: 'Umami',
    role: { en: 'Cookieless page counts', fr: 'Statistiques de visite sans cookie' },
    stack: ['Umami'],
    on: 'optimus',
    tier: 4,
  },
  {
    id: 'kuma',
    kind: 'service',
    name: 'Uptime Kuma',
    role: { en: 'Watches every service on this map', fr: 'Surveille chaque service de cette carte' },
    stack: ['Uptime Kuma'],
    why: {
      en: 'The up and down on this page are Kuma’s checks, forwarded by the lab agent. Alerts go to the owner, not here.',
      fr: 'Les « en ligne » et « hors ligne » de cette page sont les vérifications de Kuma, transmises par l’agent du labo. Les alertes vont au propriétaire, pas ici.',
    },
    on: 'optimus',
    tier: 4,
  },
  {
    id: 'glances',
    kind: 'service',
    name: 'Glances',
    role: { en: 'On each machine: the figures in its card', fr: 'Sur chaque machine : les chiffres de sa carte' },
    stack: ['Glances'],
    tier: 4,
  },
  {
    id: 'n8n',
    kind: 'service',
    name: 'n8n',
    role: { en: 'Workflow automation', fr: 'Automatisation de tâches' },
    stack: ['n8n'],
    on: 'optimus',
    tier: 4,
  },
  {
    id: 'dashy',
    kind: 'service',
    name: 'Dashy',
    role: { en: 'The lab’s own start page', fr: 'La page d’accueil du labo' },
    stack: ['Dashy'],
    on: 'optimus',
    tier: 4,
  },
  {
    id: 'gnome',
    kind: 'service',
    name: 'Gnome',
    role: { en: 'A Discord bot: AI chat, music, games', fr: 'Un bot Discord : discussion IA, musique, jeux' },
    stack: ['Node.js', 'Discord'],
    on: 'optimus',
    tier: 4,
  },
  {
    id: 'missigno',
    kind: 'service',
    name: 'missigno',
    role: { en: 'End-to-end encrypted group chat, on MLS', fr: 'Messagerie de groupe chiffrée de bout en bout, sur MLS' },
    stack: ['MLS'],
    on: 'optimus',
    tier: 4,
  },
  {
    id: 'ollama',
    kind: 'service',
    name: 'Ollama',
    role: { en: 'The model behind `ask`', fr: 'Le modèle derrière `ask`' },
    stack: ['Ollama', 'CUDA'],
    why: {
      en: 'A local model on the GPU in a flat, not a datacentre: `ask` reaches it through the API, Cloudflare’s rule, the tunnel and the proxy, in that order.',
      fr: 'Un modèle local sur le GPU d’un appartement, pas d’un datacentre : `ask` l’atteint par l’API, la règle de Cloudflare, le tunnel et le proxy, dans cet ordre.',
    },
    decision: 'ask-retrieval',
    on: 'poseidon',
    tier: 4,
  },
  {
    id: 'odysseus',
    kind: 'service',
    name: 'Odysseus',
    role: { en: 'A web interface for the local models', fr: 'Une interface web pour les modèles locaux' },
    stack: ['Odysseus'],
    on: 'poseidon',
    tier: 4,
  },
  {
    id: 'lab-agent',
    kind: 'service',
    name: 'Lab agent',
    role: { en: 'Builds and pushes the snapshot', fr: 'Construit et envoie l’instantané' },
    stack: ['Node.js'],
    why: {
      en: 'One container that asks Glances, TrueNAS, Kuma, Ollama and the tunnel how they are, keeps only what this page may show, and pushes it to the API once a minute. Its code is in the site’s repository.',
      fr: 'Un conteneur qui demande à Glances, TrueNAS, Kuma, Ollama et au tunnel comment ils vont, ne garde que ce que cette page peut montrer, et l’envoie à l’API une fois par minute. Son code est dans le dépôt du site.',
    },
    on: 'optimus',
    tier: 4,
  },
]

export const labLinks: LabLink[] = [
  { from: 'visitor', to: 'cloudflare', kind: 'public' },
  { from: 'cloudflare', to: 'o2switch-site', kind: 'public' },
  { from: 'cloudflare', to: 'o2switch-api', kind: 'public' },
  { from: 'cloudflare', to: 'tunnel', kind: 'tunnel' },
  {
    from: 'o2switch-api',
    to: 'cloudflare',
    kind: 'restricted',
    label: { en: 'only the API and home may reach the model', fr: 'seuls l’API et la maison peuvent joindre le modèle' },
  },
  { from: 'tunnel', to: 'npm', kind: 'tunnel' },
  { from: 'npm', to: 'ollama', kind: 'tunnel' },
  { from: 'npm', to: 'odysseus', kind: 'tunnel' },
  { from: 'npm', to: 'umami', kind: 'tunnel' },
  { from: 'npm', to: 'n8n', kind: 'tunnel' },
  { from: 'npm', to: 'dashy', kind: 'tunnel' },
  { from: 'npm', to: 'missigno', kind: 'tunnel' },
  {
    from: 'tailscale',
    to: 'optimus',
    kind: 'private',
    label: { en: 'admin only, not reachable from here', fr: 'administration seulement, inaccessible d’ici' },
  },
  { from: 'tailscale', to: 'poseidon', kind: 'private' },
  {
    from: 'lab-agent',
    to: 'o2switch-api',
    kind: 'push',
    label: { en: 'the snapshot, once a minute', fr: 'l’instantané, une fois par minute' },
  },
]

export const labTiers: number = Math.max(...labNodes.map((node) => node.tier)) + 1

export function findLabNode(id: string): LabNode | undefined {
  return labNodes.find((node) => node.id === id)
}

/** The machine nodes, for `ssh` and the lab shell. */
export const labMachines: LabNode[] = labNodes.filter((node) => node.kind === 'machine')

/** The services drawn inside a machine's card. */
export function servicesOn(machine: string): LabNode[] {
  return labNodes.filter((node) => node.on === machine)
}
