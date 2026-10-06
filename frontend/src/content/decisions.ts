import type { Decision } from './types'

/**
 * The choices the site made and what it turned down, for `why <topic>`. Each entry is a
 * pointer into the design docs (`source`), which stay the authority: `because` is one
 * sentence, and the spec has the rest. Seeded from the specs' rejected alternatives,
 * the roadmap's departures and features-spec.
 */
export const decisions: Decision[] = [
  {
    id: 'prism-turn',
    topic: {
      en: 'How pages change',
      fr: "Comment on passe d'une page à l'autre",
    },
    chose: {
      en: 'Each page is a face of a prism turning about a vertical axis behind the screen: the two pages swing a true 90° in CSS 3D while the wireframe field yaws 40° the same way, all read from one 650 ms eased clock.',
      fr: "Chaque page est une face d'un prisme qui pivote autour d'un axe vertical placé derrière l'écran : les deux pages font un vrai quart de tour en CSS 3D pendant que le nuage de formes pivote de 40° dans le même sens, le tout piloté par une seule horloge lissée de 650 ms.",
    },
    rejected: [
      {
        what: {
          en: 'Turning the camera itself',
          fr: 'Faire tourner la caméra elle-même',
        },
        because: {
          en: "A literal orbit to a side view puts the camera inside the field of shapes, and a floor grid to give the camera's turn something to read against would be a permanent element on every page for a 650 ms effect.",
          fr: "Une vraie orbite jusqu'à une vue de côté place la caméra au milieu du nuage de formes, et une grille au sol pour donner un repère à la rotation de la caméra ajouterait un élément permanent à chaque page pour un effet de 650 ms.",
        },
      },
      {
        what: {
          en: 'A roll about the view axis',
          fr: "Un roulis autour de l'axe de visée",
        },
        because: {
          en: 'It reads as a dial being turned, not a room being crossed.',
          fr: 'On croit voir tourner un cadran, pas traverser une pièce.',
        },
      },
      {
        what: {
          en: 'A scroll-driven transition',
          fr: 'Une transition pilotée par le défilement',
        },
        because: {
          en: 'There is no scroll between two routes to drive it.',
          fr: "Entre deux routes, il n'y a aucun défilement pour la piloter.",
        },
      },
    ],
    pr: 78,
    source: { doc: 'docs/superpowers/specs/2026-09-22-tools-and-views-design.md', anchor: '3-the-prism--one-clock-three-readers' },
    hindsight: {
      en: "At first Vue's <Transition> ended on its own timer, about a frame after the swing, and the page being left flashed back flat for that frame. Since #89 its hooks wait on the swing's clock (`untilSettled`), which releases them in the same tick the stage leaves `position: fixed`.",
      fr: "Au départ, la <Transition> de Vue se terminait sur son propre minuteur, environ une image après le pivot, et la page quittée réapparaissait à plat le temps de cette image. Depuis la #89, ses hooks attendent l'horloge du pivot (`untilSettled`), qui les libère dans le même tick que celui où la scène quitte `position: fixed`.",
    },
  },
  {
    id: 'swing-not-fade',
    topic: {
      en: 'Why pages swing instead of fading',
      fr: "Pourquoi un pivot plutôt qu'un fondu",
    },
    chose: {
      en: "Both pages stay in the DOM for the whole turn (Vue's default `<Transition>` mode, not `out-in`), one swinging out as the next swings in from the same side.",
      fr: "Les deux pages restent dans le DOM pendant tout le pivot (le mode par défaut de la `<Transition>` de Vue, pas `out-in`) : l'une sort en tournant pendant que la suivante arrive du même côté.",
    },
    rejected: [
      {
        what: {
          en: '`mode="out-in"` with a fade',
          fr: '`mode="out-in"` avec un fondu',
        },
        because: {
          en: 'A fade says the page is loading, where the swing says the visitor has moved into the next room.',
          fr: "Un fondu laisse entendre que la page charge, alors que le pivot dit qu'on vient de passer dans la pièce d'à côté.",
        },
      },
    ],
    pr: 78,
    source: { doc: 'docs/superpowers/specs/2026-09-22-tools-and-views-design.md', anchor: 'rejected' },
    hindsight: {
      en: "The spec's rejected list says reduced-motion visitors get the fade instead. What shipped, as §3 of the same spec specifies, is an instant swap: under reduced motion the `<Transition>` puts no classes on and no tween starts.",
      fr: "La liste des options écartées promet le fondu aux visiteurs qui réduisent les animations. Ce qui a été livré, comme le prévoit le §3 de la même spec, est un échange instantané : avec le mouvement réduit, la `<Transition>` n'ajoute aucune classe et aucune interpolation ne démarre.",
    },
  },
  {
    id: 'tools-page',
    topic: {
      en: 'Why the tools have their own page',
      fr: 'Pourquoi les outils ont leur propre page',
    },
    chose: {
      en: "The tools live at `/tools/:tool?`, the prism's second face, driven by `tools/registry.ts`, with each tool a lazy chunk and a deep-linkable panel.",
      fr: 'Les outils vivent sur `/tools/:tool?`, deuxième face du prisme, alimentée par `tools/registry.ts` : chaque outil est un chunk chargé à la demande et un panneau accessible par lien direct.',
    },
    rejected: [
      {
        what: {
          en: 'A `tools` section on the home page',
          fr: "Une section `tools` sur la page d'accueil",
        },
        because: {
          en: 'A converter wedged between the music player and the Steam card would make both worse, and it would leave the prism with no other face to turn to.',
          fr: "Un convertisseur glissé entre le lecteur de musique et la carte Steam desservirait les deux, et le prisme n'aurait plus aucune autre face vers laquelle tourner.",
        },
      },
    ],
    pr: 78,
    source: { doc: 'docs/superpowers/specs/2026-09-22-tools-and-views-design.md', anchor: 'rejected' },
    hindsight: {
      en: 'Tools, vol. 3 (jwt, regex, cron, qr, diff) later went in as a folder, a registry entry and a set of strings per tool, without touching the home page.',
      fr: "Le lot « Tools, vol. 3 » (jwt, regex, cron, qr, diff) s'est ensuite ajouté à raison d'un dossier, d'une entrée de registre et de quelques chaînes par outil, sans toucher à la page d'accueil.",
    },
  },
  {
    id: 'rooms-sse',
    topic: {
      en: 'How the rooms stay in sync',
      fr: 'Comment les salons restent synchronisés',
    },
    chose: {
      en: 'A room is an in-memory code with one state: guests hold an SSE stream of it and the host changes it with a token-checked `POST`, on the same Nest `@Sse()` that `/presence` already runs in production.',
      fr: "Un salon est un code en mémoire porteur d'un seul état : les invités le reçoivent par un flux SSE et l'hôte le modifie par un `POST` vérifié par jeton, avec le même `@Sse()` de Nest que `/presence` fait déjà tourner en production.",
    },
    rejected: [
      {
        what: {
          en: 'Socket.IO or WebSockets',
          fr: 'Socket.IO ou WebSockets',
        },
        because: {
          en: 'WebSockets are unproven on Passenger behind an Apache without `mod_proxy`, while SSE and POST already work there for `/presence`.',
          fr: "Les WebSockets n'ont jamais été éprouvés sur Passenger derrière un Apache sans `mod_proxy`, alors que SSE et POST y fonctionnent déjà pour `/presence`.",
        },
      },
      {
        what: {
          en: 'A member list',
          fr: 'Une liste des participants',
        },
        because: {
          en: 'The `/presence` privacy rule allows a head count and no visitor ids.',
          fr: "La règle de confidentialité de `/presence` n'autorise qu'un décompte, sans aucun identifiant de visiteur.",
        },
      },
    ],
    pr: 82,
    source: { doc: 'docs/superpowers/specs/2026-09-22-tools-and-views-design.md', anchor: '6-watchparty-and-radio--after-the-client-side-tools' },
    hindsight: {
      en: "The spec planned the YouTube IFrame API script, but both embeds ended up driven over `postMessage`, so neither player runs a third-party script on the origin and the CSP gained only a `frame-src`. The same transport later carried connect four (#98), which added a second seat token beside the host's.",
      fr: "La spec prévoyait le script de l'API IFrame de YouTube, mais les deux lecteurs sont finalement pilotés par `postMessage` : aucun des deux ne fait tourner de script tiers sur le domaine, et la CSP n'a gagné qu'une entrée `frame-src`. Le même transport a ensuite servi au puissance 4 (#98), qui ajoute un second jeton de place à côté de celui de l'hôte.",
    },
  },
  {
    id: 'ffmpeg-single-thread',
    topic: {
      en: 'Why ffmpeg runs on one thread',
      fr: 'Pourquoi ffmpeg tourne sur un seul thread',
    },
    chose: {
      en: "The ffmpeg tool loads the single-thread `@ffmpeg/core` 0.12.10, served from the site's own `/assets/` and fetched only when the visitor presses the 32 MB download button.",
      fr: "L'outil ffmpeg charge le cœur mono-thread `@ffmpeg/core` 0.12.10, servi depuis le dossier `/assets/` du site lui-même et téléchargé seulement quand le visiteur appuie sur le bouton de téléchargement de 32 Mo.",
    },
    rejected: [
      {
        what: {
          en: 'The multi-thread core with COOP/COEP headers',
          fr: 'Le cœur multi-thread avec les en-têtes COOP/COEP',
        },
        because: {
          en: 'Those headers apply to the whole document, and on this single-page site they would break the SoundCloud embed on the home face.',
          fr: "Ces en-têtes s'appliquent au document entier, et sur ce site d'une seule page ils casseraient le lecteur SoundCloud de la face d'accueil.",
        },
      },
      {
        what: {
          en: 'Loading the core from unpkg',
          fr: 'Charger le cœur depuis unpkg',
        },
        because: {
          en: "Serving it from `/assets/` keeps the CSP at `'self'` and lets the immutable cache header fetch the 32 MB once per browser.",
          fr: "Le servir depuis `/assets/` laisse la CSP à `'self'` et, grâce à l'en-tête de cache immutable, les 32 Mo ne sont téléchargés qu'une fois par navigateur.",
        },
      },
    ],
    pr: 81,
    source: { doc: 'docs/superpowers/specs/2026-09-22-tools-and-views-design.md', anchor: '5-the-tools-in-three-tiers' },
    hindsight: {
      en: 'The spec first treated the single-thread core as a fallback, and the plan would have set COOP/COEP on `/tools/*` if it proved too slow. Once built it was kept by decision, because the headers would cover the one document the embed lives in, so no headers were added.',
      fr: "La spec voyait d'abord le cœur mono-thread comme un repli, et le plan prévoyait de poser COOP/COEP sur `/tools/*` s'il s'avérait trop lent. Une fois construit, il a été gardé par choix, puisque ces en-têtes couvriraient le seul document où vit le lecteur SoundCloud, et aucun en-tête n'a été ajouté.",
    },
  },
  {
    id: 'ask-no-rag',
    topic: {
      en: 'How ask knows about the site',
      fr: 'Comment ask connaît le site',
    },
    chose: {
      en: 'ask puts the whole of llms.txt, a few kilobytes, into its system prompt instead of retrieving passages from an index.',
      fr: "ask place l'intégralité de llms.txt, quelques kilo-octets, dans son prompt système au lieu d'aller chercher des passages dans un index.",
    },
    rejected: [
      {
        what: {
          en: 'Retrieval over an index (RAG)',
          fr: 'Une recherche dans un index (RAG)',
        },
        because: {
          en: 'The whole corpus is a few kilobytes, small enough to send in full with every question.',
          fr: 'Le corpus entier ne pèse que quelques kilo-octets, assez peu pour être envoyé en entier avec chaque question.',
        },
      },
      {
        what: {
          en: 'A build-time copy in the backend',
          fr: 'Une copie figée au build dans le backend',
        },
        because: {
          en: 'It would couple two deploy units that release independently.',
          fr: "Elle lierait deux unités de déploiement qui sortent indépendamment l'une de l'autre.",
        },
      },
      {
        what: {
          en: 'A hand-maintained copy of the corpus',
          fr: 'Une copie du corpus tenue à la main',
        },
        because: {
          en: 'It would drift from the site within a month.',
          fr: "Elle divergerait du site en moins d'un mois.",
        },
      },
    ],
    pr: 23,
    source: { doc: 'docs/superpowers/specs/2026-08-04-ask-command-design.md', anchor: 'grounding--no-rag' },
    hindsight: {
      en: 'The corpus was first fetched on the request path, and in production that loopback call to the frontend hung requests past 120 s without the model ever being contacted. It now refreshes in the background, and a question is answered from the cached copy, a stale one or a baked-in fallback, so the first question after a restart gets the fallback.',
      fr: "Le corpus était d'abord récupéré pendant la requête, et en production cet appel en boucle locale vers le frontend bloquait les requêtes au-delà de 120 s sans que le modèle soit jamais sollicité. Il se rafraîchit désormais en arrière-plan, et chaque question est servie depuis la copie en cache, une copie périmée ou un corpus de secours intégré : la première question après un redémarrage tombe donc sur ce dernier.",
    },
  },
  {
    id: 'mcp-sdk',
    topic: {
      en: 'Why the MCP server is hand-written',
      fr: 'Pourquoi le serveur MCP est écrit à la main',
    },
    chose: {
      en: 'The MCP endpoint is a hand-written, stateless Streamable-HTTP handler that answers initialize, ping, tools/* and resources/* with plain JSON, 202 for notifications and 405 to GET and DELETE.',
      fr: "L'endpoint MCP est un handler Streamable HTTP sans état, écrit à la main, qui répond à initialize, ping, tools/* et resources/* en JSON brut, par un 202 aux notifications et par un 405 à GET et DELETE.",
    },
    rejected: [
      {
        what: {
          en: '@modelcontextprotocol/sdk',
          fr: '@modelcontextprotocol/sdk',
        },
        because: {
          en: "The server never needs a session, a stream or a write, so almost all of the SDK's surface would go unused.",
          fr: "Le serveur n'a jamais besoin de session, de flux ni d'écriture, donc presque toute la surface du SDK resterait inutilisée.",
        },
      },
    ],
    pr: 98,
    source: { doc: 'docs/superpowers/specs/2026-09-24-september-batch-design.md', anchor: 'backend' },
  },
  {
    id: 'polling',
    topic: {
      en: 'Why the guestbook ticker polls',
      fr: "Pourquoi le ticker du livre d'or fait du polling",
    },
    chose: {
      en: 'The guestbook ticker re-reads GET /guestbook every 20 s, skips while the tab is hidden and stops after three failures in a row, while presence, which is only interesting because it moves, is pushed over SSE.',
      fr: "Le ticker du livre d'or relit GET /guestbook toutes les 20 s, saute son tour quand l'onglet est masqué et abandonne après trois échecs d'affilée, tandis que la présence, qui n'a d'intérêt que parce qu'elle bouge, est poussée en SSE.",
    },
    rejected: [
      {
        what: {
          en: 'SSE for the guestbook',
          fr: "Du SSE pour le livre d'or",
        },
        because: {
          en: 'It would mean a new backend module, a long-lived connection per visitor and a reconnect story, for latency nobody is measuring.',
          fr: 'Il faudrait un nouveau module backend, une connexion longue par visiteur et une logique de reconnexion, pour une latence que personne ne mesure.',
        },
      },
      {
        what: {
          en: 'Polling for presence',
          fr: 'Du polling pour la présence',
        },
        because: {
          en: 'A 20-second poll would show a count that is usually wrong and never seen to change.',
          fr: "Un polling toutes les 20 secondes afficherait un compteur le plus souvent faux et qu'on ne verrait jamais bouger.",
        },
      },
    ],
    pr: 40,
    source: { doc: 'docs/features-spec.md', anchor: 'live-guestbook-ticker' },
  },
  {
    id: 'steam-proxy',
    topic: {
      en: 'Where the Steam game log comes from',
      fr: "D'où vient le journal de jeux Steam",
    },
    chose: {
      en: 'A NestJS module calls the Steam Web API with a server-side key, caches the result in memory for five minutes and serves a small shape at GET /steam/activity, answering { configured: false } on any failure.',
      fr: 'Un module NestJS interroge la Steam Web API avec une clé gardée côté serveur, met le résultat en cache mémoire cinq minutes et sert un format réduit sur GET /steam/activity, ou { configured: false } au moindre échec.',
    },
    rejected: [
      {
        what: {
          en: 'A third-party SVG embed',
          fr: 'Une image SVG générée par un service tiers',
        },
        because: {
          en: "It would not match the terminal theme and would tie the card to an outside service's uptime.",
          fr: "Elle jurerait avec le thème terminal et ferait dépendre la carte de la disponibilité d'un service extérieur.",
        },
      },
      {
        what: {
          en: 'Calling Steam from the browser',
          fr: 'Appeler Steam depuis le navigateur',
        },
        because: {
          en: 'The API key would then have to ship to every visitor.',
          fr: "La clé d'API aurait alors dû être livrée à chaque visiteur.",
        },
      },
      {
        what: {
          en: 'A 4xx or 5xx when Steam fails',
          fr: 'Une erreur 4xx ou 5xx quand Steam échoue',
        },
        because: {
          en: 'The frontend has no need to tell failure modes apart, since every one of them ends in the static game list.',
          fr: "Le frontend n'a pas à distinguer les causes d'échec, puisque toutes aboutissent à la liste de jeux statique.",
        },
      },
      {
        what: {
          en: 'An external cache such as Redis',
          fr: 'Un cache externe comme Redis',
        },
        because: {
          en: 'An in-memory five-minute cache is enough for a low-traffic portfolio.',
          fr: 'Un cache en mémoire de cinq minutes suffit largement pour un portfolio à faible trafic.',
        },
      },
    ],
    pr: 2,
    source: { doc: 'docs/superpowers/specs/2026-07-27-steam-game-log-integration.md', anchor: 'decisions' },
  },
  {
    id: 'soundcloud-widget',
    topic: {
      en: 'How the music player is embedded',
      fr: 'Comment le lecteur de musique est intégré',
    },
    chose: {
      en: "The Music section embeds SoundCloud's public player as a plain iframe, compact and tinted the site's green, with no Widget API script and no custom controls.",
      fr: 'La section Musique intègre le lecteur public de SoundCloud dans une simple iframe, en mode compact et teintée du vert du site, sans le script Widget API ni commandes maison.',
    },
    rejected: [
      {
        what: {
          en: 'Custom controls over the Widget JS API',
          fr: 'Des commandes maison via la Widget JS API',
        },
        because: {
          en: 'Wiring the events, lifecycle and playback state of w.soundcloud.com/player/api.js was meaningfully more code than a portfolio card needed when the plain widget already did the job.',
          fr: "Brancher les événements, le cycle de vie et l'état de lecture de w.soundcloud.com/player/api.js demandait nettement plus de code que ne le justifiait une carte de portfolio, alors que le widget seul faisait déjà l'affaire.",
        },
      },
      {
        what: {
          en: 'The tall cover-art layout',
          fr: 'La grande mise en page avec pochette',
        },
        because: {
          en: 'Compact mode matched the small footprint of the mock player it replaced.',
          fr: "Le mode compact collait à l'encombrement réduit de la maquette de lecteur qu'il remplaçait.",
        },
      },
    ],
    pr: 1,
    source: { doc: 'docs/superpowers/specs/2026-07-27-soundcloud-embed-design.md', anchor: 'decisions' },
    hindsight: {
      en: "The radio rooms later needed that control and got it without the script: SoundCloudPlayer.vue speaks the Widget API's postMessage protocol straight to the same iframe, so the CSP still adds only a frame-src. The Music section itself is still the plain iframe, though PR #8 raised it from 166 to 400 pixels so the playlist shows.",
      fr: "Les salons radio ont fini par avoir besoin de ce contrôle, et l'ont obtenu sans le script : SoundCloudPlayer.vue pilote directement la même iframe avec le protocole postMessage de la Widget API, si bien que la CSP n'ajoute toujours qu'un frame-src. La section Musique reste une simple iframe, que la PR #8 a fait passer de 166 à 400 pixels pour que la playlist soit visible.",
    },
  },
  {
    id: 'ctf-client-side',
    topic: {
      en: 'Where CTF flags are checked',
      fr: 'Où les flags du CTF sont vérifiés',
    },
    chose: {
      en: "Flags are checked in the browser: ctf.ts holds the SHA-256 of each stage's flag and hashes a submission with crypto.subtle, with no backend involved.",
      fr: "Les flags sont vérifiés dans le navigateur : ctf.ts contient l'empreinte SHA-256 du flag de chaque étape et hache la saisie avec crypto.subtle, sans aucun backend.",
    },
    rejected: [
      {
        what: {
          en: 'A POST /ctf/verify endpoint',
          fr: 'Un endpoint POST /ctf/verify',
        },
        because: {
          en: 'It would put the chain in a second deploy unit that releases on its own and make it the one part of the site that stops working when the API is down.',
          fr: "Il aurait placé la chaîne dans une seconde unité de déploiement publiée séparément, et en aurait fait la seule partie du site qui tombe avec l'API.",
        },
      },
      {
        what: {
          en: 'A server-side scoreboard',
          fr: 'Un tableau des scores côté serveur',
        },
        because: {
          en: "It needs a publicly writable store, which is the guestbook's spam problem again with no off switch that would not also break the chain.",
          fr: "Il exige un stockage ouvert en écriture à tous, soit à nouveau le problème de spam du livre d'or, sans interrupteur qui ne casserait pas aussi la chaîne.",
        },
      },
      {
        what: {
          en: 'Flag values listed in the bundle',
          fr: 'La liste des flags en clair dans le bundle',
        },
        because: {
          en: 'Anyone reading the bundle could then list the answers instead of only verifying one they had found.',
          fr: "Quiconque lit le bundle pourrait alors lister les réponses, au lieu de seulement vérifier celle qu'il a trouvée.",
        },
      },
    ],
    pr: 98,
    source: { doc: 'docs/superpowers/specs/2026-08-04-ctf-flag-chain-design.md', anchor: 'where-flags-are-validated' },
    hindsight: {
      en: "Progress ended up storing the flag values rather than only the stage ids, because the board shows each flag and decrypt rebuilds the finale's AES-GCM key from the seven earlier ones. When the payoff was re-sealed (PR #117), only SEALED changed, so the stage hashes and everyone's stored flags survived.",
      fr: "La progression stocke finalement la valeur des flags et pas seulement les identifiants d'étape, car le tableau affiche chaque flag et decrypt reconstruit la clé AES-GCM du final à partir des sept premiers. Quand le message final a été rechiffré (PR #117), seul SEALED a changé : les empreintes des étapes et les flags déjà enregistrés sont restés valides.",
    },
  },
  {
    id: 'battleship',
    topic: {
      en: 'Why the two-player game is connect four',
      fr: 'Pourquoi le jeu à deux est un puissance 4',
    },
    chose: {
      en: 'The two-player game is connect four over a room code, where the server stores the public move list and checks only the seat, turn order, column range and column height.',
      fr: "Le jeu à deux est un puissance 4 joué via un code de salon, où le serveur garde la liste publique des coups et ne vérifie que le siège, l'ordre des tours, la colonne et sa hauteur.",
    },
    rejected: [
      {
        what: {
          en: 'Battleship',
          fr: 'La bataille navale',
        },
        because: {
          en: 'Its hidden fleets would have to live on the server to keep a player honest, which is exactly the trust the rooms do not have.',
          fr: "Ses flottes cachées devraient vivre sur le serveur pour empêcher un joueur de tricher, soit précisément la confiance que les salons n'ont pas.",
        },
      },
      {
        what: {
          en: 'Deciding wins on the server',
          fr: 'Décider de la victoire côté serveur',
        },
        because: {
          en: "Connect four's state is public, so both clients work out a win from the same move list with the pure rules module.",
          fr: "L'état d'un puissance 4 est public, donc les deux clients déduisent la victoire de la même liste de coups grâce au module de règles pur.",
        },
      },
    ],
    pr: 98,
    source: { doc: 'docs/superpowers/specs/2026-09-24-september-batch-design.md', anchor: 'backend' },
  },
  {
    id: 'tetris',
    topic: {
      en: 'Why tetris exists after all',
      fr: 'Pourquoi tetris a fini par exister',
    },
    chose: {
      en: "tetris arrived in vol. 2 as a 10×18 well drawn two characters per cell, on snake's tick loop, with a rotation that tries in place, then one cell left, then one right.",
      fr: 'tetris est arrivé avec le vol. 2 : un puits de 10×18 dessiné avec deux caractères par case, sur la boucle de tick de snake, avec une rotation qui essaie sur place, puis une case à gauche, puis une à droite.',
    },
    rejected: [
      {
        what: {
          en: 'Keeping tetris out of scope',
          fr: 'Laisser tetris hors périmètre',
        },
        because: {
          en: 'Snake had already built the gravity loop, so what remained was a piece table and a collision test.',
          fr: "Snake fournissait déjà la boucle de gravité, si bien qu'il ne restait qu'une table de pièces et un test de collision.",
        },
      },
      {
        what: {
          en: 'SRS wall kicks',
          fr: 'Les wall kicks du SRS',
        },
        because: {
          en: 'A kick table is a page of data for rotations a player never attempts on a 10-wide well.',
          fr: "Une table de kicks, c'est une page de données pour des rotations qu'aucun joueur ne tente dans un puits de 10 cases de large.",
        },
      },
      {
        what: {
          en: 'One character per cell',
          fr: 'Un caractère par case',
        },
        because: {
          en: 'A character cell is about 1:2, so the well would be squashed to half height.',
          fr: 'Une case de caractère fait à peu près 1:2, donc le puits serait écrasé à mi-hauteur.',
        },
      },
      {
        what: {
          en: 'A speed curve',
          fr: 'Une vitesse qui augmente',
        },
        because: {
          en: 'A game that gets faster wants a pause key and a difficulty setting, which is more than a portfolio easter egg needs.',
          fr: "Un jeu qui accélère réclame une touche pause et un réglage de difficulté, ce qui dépasse les besoins d'un easter egg de portfolio.",
        },
      },
    ],
    pr: 59,
    source: { doc: 'docs/superpowers/specs/2026-08-07-terminal-games-vol2-design.md', anchor: 'tetris--reversing-a-decision' },
    hindsight: {
      en: 'The 2026-08-04 games spec ruled tetris out as an order of magnitude more code, for a game that reads worse in a monospace grid. Three days later the vol. 2 spec reversed that: snake had built the tick loop, kicks were never required, and two characters per cell answered the rendering objection.',
      fr: "La spec des jeux du 2026-08-04 écartait tetris : un ordre de grandeur de code en plus, pour un jeu qui rend moins bien dans une grille monospace. Trois jours plus tard, la spec du vol. 2 revenait dessus : snake avait construit la boucle de tick, les kicks n'étaient pas indispensables, et deux caractères par case réglaient l'objection sur le rendu.",
    },
  },
  {
    id: 'minesweeper-score',
    topic: {
      en: 'How a lower score can be the record',
      fr: 'Comment un score plus bas peut être le record',
    },
    chose: {
      en: 'scores.ts gives each game a direction, so minesweeper stores its clear time in seconds as it is and keeps the smaller one as the best.',
      fr: "scores.ts indique pour chaque jeu dans quel sens le score s'améliore : minesweeper enregistre son temps en secondes tel quel et garde le plus petit comme record.",
    },
    rejected: [
      {
        what: {
          en: 'Storing an inverted score (1000 - seconds)',
          fr: 'Stocker un score inversé (1000 - secondes)',
        },
        because: {
          en: 'The stored number would mean nothing and every read would need a second piece of arithmetic to display it.',
          fr: "Le nombre stocké ne voudrait plus rien dire et chaque lecture demanderait un second calcul pour l'afficher.",
        },
      },
      {
        what: {
          en: 'Recording a score of zero',
          fr: 'Enregistrer un score nul',
        },
        because: {
          en: 'For a game where lower wins, a 0 would become a record nobody could beat.',
          fr: "Pour un jeu où le plus bas l'emporte, un 0 deviendrait un record imbattable.",
        },
      },
    ],
    pr: 59,
    source: { doc: 'docs/superpowers/specs/2026-08-07-terminal-games-vol2-design.md', anchor: '2-scorests-learns-that-lower-can-be-better' },
  },
  {
    id: 'word-lists',
    topic: {
      en: 'Where the word lists come from',
      fr: "D'où viennent les listes de mots",
    },
    chose: {
      en: "The word games use lists generated from permissively licensed sources only: SCOWL via wordlist-english (MIT) for English, and an-array-of-french-words (MIT), Grammalecte's dictionary-fr (MPL-2.0) and Tatoeba's sentences (CC BY 2.0 FR) for French.",
      fr: "Les jeux de mots puisent dans des listes générées uniquement à partir de sources sous licence permissive : SCOWL via wordlist-english (MIT) pour l'anglais, et an-array-of-french-words (MIT), le dictionary-fr de Grammalecte (MPL-2.0) et les phrases de Tatoeba (CC BY 2.0 FR) pour le français.",
    },
    rejected: [
      {
        what: {
          en: 'Lexique383 and FrequencyWords',
          fr: 'Lexique383 et FrequencyWords',
        },
        because: {
          en: 'Both lists are share-alike (CC BY-SA), which FrequencyWords hides behind a repository that advertises MIT for its code.',
          fr: "Leurs listes sont en partage à l'identique (CC BY-SA), ce que FrequencyWords masque derrière un dépôt affiché sous MIT pour son code.",
        },
      },
      {
        what: {
          en: "Monkeytype's word lists",
          fr: 'Les listes de Monkeytype',
        },
        because: {
          en: 'They are GPLv3, a copyleft that would have reached the frontend.',
          fr: 'Elles sont sous GPLv3, un copyleft qui se serait étendu au frontend.',
        },
      },
      {
        what: {
          en: 'google-10000-english',
          fr: 'google-10000-english',
        },
        because: {
          en: 'Its LDC terms allow only educational and personal use, which is not a permissive licence.',
          fr: "Ses conditions LDC limitent l'usage au cadre éducatif et personnel, ce qui n'a rien d'une licence permissive.",
        },
      },
      {
        what: {
          en: 'The Leipzig Corpora',
          fr: 'Les corpus de Leipzig',
        },
        because: {
          en: 'Different pages of the source state different licences, and a licence the source itself is unclear about cannot be relied on.',
          fr: "Leurs pages annoncent des licences différentes, et on ne peut pas s'appuyer sur une licence que la source elle-même ne fixe pas clairement.",
        },
      },
    ],
    pr: 60,
    source: { doc: 'docs/superpowers/specs/2026-08-07-terminal-games-vol2-design.md', anchor: 'constraint-that-shaped-every-choice' },
    hindsight: {
      en: 'These lists replaced the hand-written ones the spec first called for, which had about 440 answers per locale, no frequency data and French conjugations such as ABOYA sitting next to TABLE.',
      fr: "Ces listes ont remplacé celles écrites à la main que prévoyait d'abord la spec, avec environ 440 réponses par langue, aucune donnée de fréquence et des formes conjuguées comme ABOYA à côté de TABLE.",
    },
  },
]

export function findDecision(id: string): Decision | undefined {
  return decisions.find((decision) => decision.id === id.toLowerCase())
}
