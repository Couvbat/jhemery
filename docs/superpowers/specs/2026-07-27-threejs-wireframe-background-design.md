# Fond animé Three.js — formes wireframe

## Contexte

Le portfolio (thème "terminal cyberpunk", vert néon `#00ff41` sur fond très sombre) manque de profondeur visuelle en arrière-plan. Objectif : un fond animé en Three.js avec des primitives géométriques simples en wireframe, flottant derrière tout le contenu du site.

## Portée

- Fond appliqué à **tout le site** (fixe, visible pendant le scroll sur toutes les sections), pas seulement le Hero.
- Un seul nouveau composant Vue, monté une fois dans `App.vue`.
- Pas de dépendance à un framework Three.js tiers (pas de `@react-three/fiber` etc., Vue + `three` brut suffit).

## Composant

`frontend/src/components/ThreeBackground.vue`

- Monté dans `App.vue`, juste avant `<RouterView />` :
  ```html
  <ThreeBackground />
  <NavBar />
  <RouterView />
  ```
- Racine : `<canvas>` en `position: fixed; inset: 0; z-index: -1; pointer-events: none;` — jamais au-dessus du contenu, jamais cliquable.
- Le renderer utilise `alpha: true` pour laisser transparaître `--background` du thème derrière le canvas.

## Scène

- Caméra perspective (`PerspectiveCamera`), position reculée pour englober la scène.
- 8 à 12 primitives wireframe réparties aléatoirement (position + rotation initiale) dans un volume 3D borné (évite qu'elles sortent trop du champ de vision) :
  - `IcosahedronGeometry`, `TorusGeometry`, `BoxGeometry`, `OctahedronGeometry` — mélangées aléatoirement parmi la liste.
  - `MeshBasicMaterial({ wireframe: true, transparent: true, opacity: … })`, opacité variable par forme (~0.15–0.4) pour donner une sensation de profondeur (formes "loin" plus discrètes).
- Couleurs : majorité en vert néon du thème (`--neon-green`, lu depuis les custom properties CSS au montage), 2–3 formes en cyan (`--neon-cyan`) pour une touche de variété, sans dévier du thème existant.
- Chaque forme tourne en continu sur elle-même (vitesse et axe propres à chaque forme, légère variation aléatoire pour éviter un mouvement mécanique/synchronisé).

## Interactivité

- Parallax léger : la position souris (normalisée en `[-1, 1]` sur X/Y via `mousemove` sur `window`) décale doucement la position de la caméra par interpolation (`lerp`), jamais de saut brutal. Amplitude faible pour rester en fond, pas au premier plan.
- Sur mobile/tactile (pas d'événement `mousemove` pertinent), la scène tourne simplement sans parallax — pas de fallback tactile spécifique nécessaire.

## Accessibilité / perf

- Respect de `prefers-reduced-motion: reduce` : si actif, on saute la boucle de rotation/parallax et on rend une seule frame statique (formes visibles mais figées).
- Resize : listener sur `window.resize` pour mettre à jour `camera.aspect`, `camera.updateProjectionMatrix()` et `renderer.setSize`.
- Cleanup complet dans `onUnmounted` : `cancelAnimationFrame`, `dispose()` sur chaque géométrie/matériau, `renderer.dispose()`, retrait des listeners (`resize`, `mousemove`).
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` pour éviter de surcharger sur les écrans très haute densité.

## Dépendances

- Ajout de `three` aux `dependencies` du `frontend/package.json`.
- Ajout de `@types/three` aux `devDependencies` (TypeScript strict déjà en place via `vue-tsc`).

## Hors périmètre

- Pas de personnalisation par section (le fond est identique sur tout le site).
- Pas de contrôle utilisateur (toggle on/off, réglages) — c'est un simple fond ambiant.
- Pas de tests automatisés dédiés (composant purement visuel, pas de logique métier testable unitairement) ; vérification par preview navigateur manuelle.
