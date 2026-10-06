import type { WorkPart } from './types'

/**
 * The case studies: the portfolio's own parts, each at `/work/<id>`, under the projects
 * section, and in the shell as `projects <id>` and `cat projects/<id>.md`. Every surface
 * reads this one array. Code links are pinned to the build's commit and design links
 * land on the notes, so neither drifts from what it describes.
 */
export const work: WorkPart[] = [
  {
    id: 'vim',
    name: {
      en: 'The vim pane',
      fr: 'Le volet vim',
    },
    summary: {
      en: "A modal editor that takes the place of the terminal's scrollback when `vim` runs: normal and insert modes, `hjkl` motion, line splits and merges, dirty tracking, and real vim's E37 and E45 refusals. Edits live in memory only, and the files it opens are the ones `cat` reads, through the same resolver.",
      fr: "Un éditeur modal qui prend la place de l'historique du terminal quand `vim` est lancé : modes normal et insertion, déplacements `hjkl`, découpe et fusion de lignes, suivi des modifications, et les refus E37 et E45 du vrai vim. Les modifications restent en mémoire, et les fichiers ouverts sont ceux que lit `cat`, via le même résolveur.",
    },
    hard: {
      en: [
        "The pane has no input of its own: the shell's `<input>` doubles as vim's `:` line. A key goes to the editor only when that input is empty and no modifier is held, so `Ctrl+C`/`Ctrl+L` keep working. The editor hands `:` back in normal mode, so `:q` types into the input; in insert mode it keeps it as a character. It once kept `:` from the editor in every mode, and a colon could not be typed into a file.",
        "Escape belongs to vim while the pane is open. In insert mode it drops to normal mode, in normal mode it does nothing, and either way it must be stopped outright, or the overlay's own Escape handler would fire too. It once fell through to that handler in normal mode, which sent `:q!`: the key vim users press out of habit quit the editor and discarded the edits.",
        "Leaving had to stay possible. A dirty buffer refuses `:q` with E37, as in vim, and a visitor who had typed text was trapped because the red close dot also sent `:q`. It now sends `:q!`, and a test covers each way out. Refusals are written to the pane's status line, since the pane hides the scrollback.",
        'The buffer logic is a pure module with no Vue or DOM imports, where the edge cases live: normal mode may not sit past the last character but `a`/`A` may, Backspace at column 0 joins onto the previous line at the right column, and Escape steps the cursor back one.',
      ],
      fr: [
        "Le volet n'a pas de champ à lui : l'`<input>` du shell sert aussi de ligne `:` à vim. Une touche n'est confiée à l'éditeur que si ce champ est vide et sans modificateur ; ainsi `Ctrl+C`/`Ctrl+L` restent actifs. En mode normal, l'éditeur rend `:`, si bien que `:q` se tape dans le champ ; en mode insertion, il le garde comme un caractère. Autrefois `:` n'atteignait l'éditeur dans aucun mode, et l'on ne pouvait pas taper de deux-points dans un fichier.",
        "Tant que le volet est ouvert, Échap appartient à vim. En mode insertion, la touche ramène au mode normal ; en mode normal, elle ne fait rien ; dans les deux cas elle doit être entièrement interceptée, sinon le gestionnaire Échap de l'overlay se déclencherait aussi. En mode normal, elle passait autrefois jusqu'à ce gestionnaire, qui envoyait `:q!` : la touche que les habitués de vim pressent par réflexe fermait l'éditeur et jetait les modifications.",
        "Il fallait toujours pouvoir sortir. Un tampon modifié refuse `:q` avec E37, comme dans vim, et un visiteur qui avait saisi du texte s'est retrouvé coincé parce que le bouton rouge envoyait lui aussi `:q`. Il envoie désormais `:q!`, et chaque sortie a son test. Les refus s'affichent dans la ligne d'état du volet, puisque celui-ci masque l'historique.",
        "La logique du tampon est un module pur, sans import Vue ni DOM, et c'est là que se trouvent les cas limites : le mode normal ne peut pas dépasser le dernier caractère mais `a`/`A` le peuvent, Retour arrière en colonne 0 fusionne avec la ligne précédente à la bonne colonne, et Échap recule le curseur d'un cran.",
      ],
    },
    numbers: [
      { label: {
        en: 'vim error for `:q` on a modified buffer',
        fr: 'Erreur vim pour `:q` sur un tampon modifié',
      }, value: 'E37' },
      { label: {
        en: 'vim error for any write (`:wq`, `:x`)',
        fr: 'Erreur vim pour toute écriture (`:wq`, `:x`)',
      }, value: 'E45' },
      { label: {
        en: 'Tilde filler rows, clipped by the container',
        fr: 'Lignes de tildes, rognées par le conteneur',
      }, value: '60' },
    ],
    code: [
      'frontend/src/terminal/vimEditor.ts',
      'frontend/src/components/terminal/VimPane.vue',
      'frontend/src/components/terminal/TerminalOverlay.vue',
      'frontend/src/terminal/commands/eggs.ts',
      'frontend/src/terminal/__tests__/vim-quit.spec.ts',
    ],
    spec: { doc: 'docs/superpowers/specs/2026-07-29-vim-pane-editing-design.md', anchor: 'key-mapping' },
  },
  {
    id: 'qr',
    name: {
      en: 'The QR encoder',
      fr: "L'encodeur QR",
    },
    summary: {
      en: "A QR encoder written from ISO/IEC 18004 instead of installed from npm: byte mode for any UTF-8 text, versions 1 to 40, all four error-correction levels, Reed–Solomon over GF(2⁸), and the mask chosen by the standard's penalty score. It outputs a single-path SVG, or a PNG drawn only at download time, and nothing leaves the browser.",
      fr: "Un encodeur QR écrit d'après la norme ISO/IEC 18004 plutôt qu'installé depuis npm : mode octet pour tout texte UTF-8, versions 1 à 40, les quatre niveaux de correction d'erreurs, Reed–Solomon sur GF(2⁸), et le masque retenu selon le score de pénalité de la norme. Il produit un SVG d'un seul tracé, ou un PNG dessiné au moment du téléchargement, sans que rien ne quitte le navigateur.",
    },
    hard: {
      en: [
        `An encoder that is subtly wrong still draws something that looks like a QR code, so "it scans" proves little. Each stage is checked against an answer the code did not compute: the standard's Annex I Reed–Solomon example, its capacity tables, and SHA-256 hashes of module matrices from segno 1.6.6, one case per structural feature.`,
        "The reference disagreed with the standard. When the bit stream already ends on a byte boundary, segno writes a whole zero codeword after the terminator, where clause 7.4.10 pads nothing. Both scan, so the test rebuilds segno's codewords and compares everything from the blocks onwards, module for module.",
        'When codewords do not divide evenly into blocks, the later blocks carry one extra data byte. A placeholder keeps every block the same length for the interleave and is then skipped.',
        'Choosing the mask means applying each of the eight, rewriting the format bits, scoring the four penalty rules (runs, 2×2 blocks, 1:1:3:1:1 finder-like patterns, dark/light balance), then XOR-ing the mask off again. A decoder written in the test file reads the results back.',
      ],
      fr: [
        "Un encodeur légèrement faux dessine quand même quelque chose qui ressemble à un QR code, donc « ça se scanne » ne prouve pas grand-chose. Chaque étape est vérifiée contre une réponse que le code n'a pas calculée : l'exemple Reed–Solomon de l'annexe I, les tables de capacité de la norme, et les empreintes SHA-256 de matrices produites par segno 1.6.6, avec un cas par particularité structurelle.",
        "La référence s'écartait de la norme. Quand le flux de bits tombe déjà sur une frontière d'octet, segno écrit un mot de code nul complet après le terminateur, là où la clause 7.4.10 n'ajoute rien. Les deux se scannent, donc le test reconstruit les mots de code de segno et compare tout le reste, module par module, à partir des blocs.",
        "Quand les mots de code ne se répartissent pas exactement entre les blocs, les derniers blocs portent un octet de données de plus. Un octet fictif donne à tous les blocs la même longueur pour l'entrelacement, puis il est ignoré.",
        "Pour choisir le masque, chacun des huit est appliqué, les bits de format réécrits, les quatre règles de pénalité évaluées (séries, blocs 2×2, motifs 1:1:3:1:1 proches d'un repère, équilibre clair/foncé), puis le masque est retiré par un second XOR. Un décodeur écrit dans le fichier de test relit le résultat.",
      ],
    },
    numbers: [
      { label: {
        en: 'Versions supported',
        fr: 'Versions prises en charge',
      }, value: '1–40' },
      { label: {
        en: 'Largest payload: version 40, level L',
        fr: 'Charge maximale : version 40, niveau L',
      }, value: { en: '2,953 bytes', fr: '2 953 octets' } },
      { label: {
        en: 'Reed–Solomon field polynomial',
        fr: 'Polynôme du corps de Reed–Solomon',
      }, value: 'x⁸ + x⁴ + x³ + x² + 1 (0x11D)' },
      { label: {
        en: 'Quiet zone',
        fr: 'Zone de silence',
      }, value: '4 modules' },
    ],
    try: 'tools/qr',
    code: [
      'frontend/src/tools/qr/qr.ts',
      'frontend/src/tools/qr/QrTool.vue',
      'frontend/src/tools/__tests__/qr.spec.ts',
    ],
    spec: { doc: 'docs/superpowers/specs/2026-09-24-september-batch-design.md', anchor: 'tools-vol-3' },
    decisions: ['tools-page'],
  },
  {
    id: 'rooms',
    name: {
      en: 'Watch and radio rooms',
      fr: 'Les salons watch et radio',
    },
    summary: {
      en: 'Shared YouTube and SoundCloud playback behind a five-character code: the host drives with a token-checked `POST`, guests follow over a server-sent event stream and correct their own drift. The server holds one state and a head count per room, in memory, with no list of who is there.',
      fr: "Une lecture YouTube ou SoundCloud partagée derrière un code de cinq caractères : l'hôte pilote par un `POST` vérifié par jeton, les invités suivent via un flux SSE et corrigent eux-mêmes leur dérive. Le serveur garde en mémoire un état et un décompte par salon, sans liste des personnes présentes.",
    },
    hard: {
      en: [
        "The state is anchored to the server's clock (`position` as of `at`), so a guest can work out where the host is now. The guest's own clock is off by an unknown amount, so `ClockSkew` samples received-minus-`at` on each new frame and keeps the smallest, since latency only ever adds. Heartbeats resend an old `at` and are not counted.",
        "The host's player only reports readings, so a seek is inferred when the position and the elapsed time disagree by more than 1.5 s. While playing, the host re-anchors every 15 s, since its own buffering is drift too, and changes are coalesced over 250 ms. Guests seek only when more than 2 s out, at most once every 1.5 s.",
        "No third-party script runs on the origin: both embeds are driven over the `postMessage` protocol their official scripts wrap. Neither frame reports anything until asked, YouTube with a `listening` message and SoundCloud with event subscriptions, and a request sent before the player is ready is lost (YouTube's `load` event comes first), so each is resent every 500 ms until the frame answers.",
        "The server stays small and bounded: a `Map` and an RxJS `Subject` per room, a timing-safe token comparison, and media allowlisted per kind because it becomes an iframe `src` on every guest's page. A 25 s heartbeat keeps Apache from closing the stream, and rooms expire after two idle hours.",
      ],
      fr: [
        "L'état est ancré sur l'horloge du serveur (`position` à l'instant `at`), ce qui permet à l'invité de calculer où en est l'hôte. L'horloge de l'invité a un décalage inconnu : `ClockSkew` mesure l'écart entre réception et `at` à chaque nouvelle trame et garde le plus petit, puisque la latence ne fait qu'ajouter. Les battements de cœur renvoient un ancien `at` et ne comptent pas.",
        "Le lecteur de l'hôte ne remonte que des relevés : un saut est déduit quand la position et le temps écoulé divergent de plus de 1,5 s. Pendant la lecture, l'hôte se recale toutes les 15 s, car sa propre mise en mémoire tampon est aussi une dérive, et les changements sont regroupés sur 250 ms. Un invité ne se repositionne qu'au-delà de 2 s d'écart, au plus une fois toutes les 1,5 s.",
        "Aucun script tiers ne tourne sur le domaine : les deux lecteurs sont pilotés par le protocole `postMessage` qu'enveloppent leurs scripts officiels. Aucune des deux iframes ne signale quoi que ce soit avant qu'on le lui demande, par un message `listening` pour YouTube et par des abonnements aux événements pour SoundCloud, et une demande envoyée avant que le lecteur soit prêt se perd (l'événement `load` de YouTube arrive avant) : chacune est donc renvoyée toutes les 500 ms jusqu'à ce que l'iframe réponde.",
        "Le serveur reste simple et borné : une `Map` et un `Subject` RxJS par salon, une comparaison de jeton à temps constant, et des médias filtrés par liste blanche selon le type, puisqu'ils finissent en `src` d'iframe chez chaque invité. Un battement de cœur toutes les 25 s empêche Apache de couper le flux, et un salon expire après deux heures d'inactivité.",
      ],
    },
    numbers: [
      { label: {
        en: 'Drift before a guest seeks',
        fr: "Écart avant qu'un invité se repositionne",
      }, value: '2 s' },
      { label: {
        en: 'Stream heartbeat',
        fr: 'Battement de cœur du flux',
      }, value: '25 s' },
      { label: {
        en: 'Idle lifetime of a room',
        fr: "Durée de vie d'un salon inactif",
      }, value: '2 h' },
      { label: {
        en: 'Open rooms at most',
        fr: 'Salons ouverts au maximum',
      }, value: '200' },
    ],
    try: 'watch',
    code: [
      'backend/src/rooms/rooms.service.ts',
      'backend/src/rooms/rooms.types.ts',
      'frontend/src/rooms/sync.ts',
      'frontend/src/rooms/RoomPage.vue',
      'frontend/src/rooms/YouTubePlayer.vue',
    ],
    spec: { doc: 'docs/superpowers/specs/2026-09-22-tools-and-views-design.md', anchor: '6-watchparty-and-radio--after-the-client-side-tools' },
    decisions: ['rooms-sse', 'soundcloud-widget'],
  },
  {
    id: 'ffmpeg',
    name: {
      en: 'The ffmpeg.wasm tool',
      fr: "L'outil ffmpeg.wasm",
    },
    summary: {
      en: "Audio and video conversion, trimming and GIF export with ffmpeg compiled to WebAssembly, running in a worker in the visitor's browser. It is the one dependency the tools page makes an exception for: 32 MB, fetched from the site's own `/assets/` only after the visitor presses the button that states the size.",
      fr: "Conversion audio et vidéo, découpe et export GIF avec ffmpeg compilé en WebAssembly, exécuté dans un worker du navigateur du visiteur. C'est la seule dépendance que la page des outils s'autorise : 32 Mo, servis depuis le dossier `/assets/` du site et téléchargés seulement quand le visiteur appuie sur le bouton qui annonce la taille.",
    },
    hard: {
      en: [
        'The multi-thread core needs `SharedArrayBuffer`, hence COOP/COEP headers, and those apply to the whole page. On a single-page site that page also holds the SoundCloud embed, so the single-thread core, planned as a fallback, became the decision.',
        "`FFmpeg.load()` reports no progress, and 32 MB with nothing moving looks like a hang. The wasm is fetched once with a stream reader so the worker's own fetch hits the HTTP cache; because Apache deflates it, `Content-Length` is the compressed size, and the known decoded size is used as the denominator.",
        'The 0.12.10 core has quirks. Its ffprobe returns -1 even on success and mixes logs and JSON on stdout, so the JSON goes to a file and that file is the verdict. Its libopus traps with `memory access out of bounds`, which poisons the instance, so the free-codec preset is Vorbis and any trap restarts the engine.',
        'Inputs are mounted over WORKERFS and read in place, not copied into the 32-bit wasm heap, so multi-gigabyte files work. The only way to stop a run is to kill the worker, so cancelling is a restart, which costs only the compile once the core is cached.',
      ],
      fr: [
        "Le cœur multi-thread exige `SharedArrayBuffer`, donc les en-têtes COOP/COEP, qui s'appliquent à toute la page. Sur un site d'une seule page, cette page contient aussi le lecteur SoundCloud : le cœur mono-thread, prévu comme solution de repli, est devenu le choix retenu.",
        "`FFmpeg.load()` ne signale aucune progression, et 32 Mo sans rien qui bouge ressemblent à un blocage. Le wasm est donc d'abord récupéré avec un lecteur de flux, pour que la requête du worker tombe ensuite dans le cache HTTP ; comme Apache le compresse, `Content-Length` donne la taille compressée, et c'est la taille décompressée connue qui sert de dénominateur.",
        "Le cœur 0.12.10 a ses bizarreries. Son ffprobe renvoie -1 même en cas de succès et mélange journaux et JSON sur stdout : le JSON est donc écrit dans un fichier, et c'est ce fichier qui fait foi. Sa libopus plante avec `memory access out of bounds`, ce qui corrompt l'instance : le préréglage en codec libre utilise Vorbis, et tout plantage redémarre le moteur.",
        "Les fichiers d'entrée sont montés via WORKERFS et lus sur place, sans copie dans le tas wasm de 32 bits, ce qui permet de traiter des fichiers de plusieurs gigaoctets. Seul l'arrêt du worker interrompt un traitement : annuler revient donc à redémarrer, ce qui ne coûte que la compilation une fois le cœur en cache.",
      ],
    },
    numbers: [
      { label: {
        en: 'ffmpeg-core.wasm, checked by a test against the installed file',
        fr: 'ffmpeg-core.wasm, vérifié par un test contre le fichier installé',
      }, value: { en: '32,232,419 bytes', fr: '32 232 419 octets' } },
      { label: {
        en: 'The same core, deflated over the wire',
        fr: 'Le même cœur, compressé pour le transfert',
      }, value: { en: 'about 10 MB', fr: 'environ 10 Mo' } },
      { label: {
        en: 'Core',
        fr: 'Cœur',
      }, value: { en: '@ffmpeg/core 0.12.10, single-thread', fr: '@ffmpeg/core 0.12.10, mono-thread' } },
    ],
    try: 'tools/ffmpeg',
    code: [
      'frontend/src/tools/ffmpeg/core.ts',
      'frontend/src/tools/ffmpeg/media.ts',
      'frontend/src/tools/ffmpeg/FfmpegTool.vue',
      'frontend/src/tools/ffmpeg/ffmpeg.worker.js',
      'frontend/public/.htaccess',
    ],
    spec: { doc: 'docs/superpowers/specs/2026-09-22-tools-and-views-design.md', anchor: '5-the-tools-in-three-tiers' },
    decisions: ['ffmpeg-single-thread', 'tools-page'],
  },
  {
    id: 'prism',
    name: {
      en: 'The prism swing',
      fr: 'Le pivot du prisme',
    },
    summary: {
      en: 'Changing page turns the site like a prism: the page being left and the one arriving are two faces meeting at a right angle behind the screen, while the three.js wireframe field turns the same way. One eased 650 ms clock drives both the CSS and the WebGL scene, so the two cannot drift apart.',
      fr: "Changer de page fait tourner le site comme un prisme : la page quittée et celle qui arrive sont deux faces qui se rejoignent à angle droit derrière l'écran, pendant que le nuage de formes three.js tourne dans le même sens. Une seule horloge lissée de 650 ms pilote à la fois le CSS et la scène WebGL, qui ne peuvent donc pas se désynchroniser.",
    },
    hard: {
      en: [
        'Both pages stay mounted for the whole turn. While it runs, the stage becomes a fixed, clipped box with a separate inner element for `perspective` and `preserve-3d`, because `overflow: hidden` flattens 3D on the element that carries it. Each face is `translateZ(-50vw) rotateY(…) translateZ(50vw)`, and the leaving page is offset by the scroll position recorded when the swing began.',
        "The easing is applied once, in `useViewSwing`, and timed from the first animation frame's own timestamp so a busy main thread cannot skip the opening frames. `App.vue` writes the result into CSS custom properties, and `ThreeBackground` reads the same ref.",
        'Orbiting the camera 90° would put it inside the field of shapes. The field yaws 40° about its own centre instead while the camera dollies back and returns. Every shape is re-homed on the first frame and the rotation is baked back to zero on the last, so the pointer gravity well keeps its unrotated maths.',
        "Vue's `<Transition>` used to end on its own timer about a frame after the stage left `position: fixed`, and the old page flashed back flat. Its hooks now wait on `untilSettled`, which releases them in the same tick. Under reduced motion no tween starts and the pages swap at once.",
      ],
      fr: [
        "Les deux pages restent montées pendant tout le pivot. Le temps qu'il dure, la scène devient une boîte fixe et rognée, avec un élément intérieur distinct pour `perspective` et `preserve-3d`, car `overflow: hidden` aplatit la 3D de l'élément qui le porte. Chaque face reçoit `translateZ(-50vw) rotateY(…) translateZ(50vw)`, et la page quittée est décalée de la position de défilement relevée au début du pivot.",
        "L'interpolation n'est calculée qu'une fois, dans `useViewSwing`, à partir de l'horodatage de la première image d'animation, pour qu'un thread principal chargé ne fasse pas sauter les premières images. `App.vue` en tire des propriétés CSS personnalisées, et `ThreeBackground` lit la même ref.",
        "Faire orbiter la caméra de 90° la placerait au milieu du nuage de formes. C'est donc le nuage qui pivote de 40° autour de son propre centre, pendant que la caméra recule puis revient. Chaque forme reçoit une nouvelle position à la première image, et la rotation est ramenée à zéro à la dernière, pour que le puits de gravité du pointeur garde des calculs valides.",
        "La `<Transition>` de Vue se terminait d'abord sur son propre minuteur, environ une image après que la scène avait quitté `position: fixed`, et l'ancienne page réapparaissait à plat. Ses hooks attendent désormais `untilSettled`, qui les libère dans le même tick. Avec le mouvement réduit, aucune interpolation ne démarre et les pages s'échangent instantanément.",
      ],
    },
    numbers: [
      { label: {
        en: 'Duration of one turn',
        fr: "Durée d'un pivot",
      }, value: '650 ms' },
      { label: {
        en: 'Page turn / wireframe field yaw',
        fr: 'Rotation des pages / du nuage de formes',
      }, value: '90° / 40°' },
      { label: {
        en: 'CSS perspective of the prism',
        fr: 'Perspective CSS du prisme',
      }, value: '1200px' },
    ],
    try: 'tools',
    code: [
      'frontend/src/composables/useViewSwing.ts',
      'frontend/src/App.vue',
      'frontend/src/assets/main.css',
      'frontend/src/components/ThreeBackground.vue',
    ],
    spec: { doc: 'docs/superpowers/specs/2026-09-22-tools-and-views-design.md', anchor: '3-the-prism--one-clock-three-readers' },
    decisions: ['prism-turn', 'swing-not-fade'],
  },
  {
    id: 'mcp',
    name: {
      en: 'The MCP endpoint',
      fr: "L'endpoint MCP",
    },
    summary: {
      en: '`POST /mcp` is a read-only Model Context Protocol server, so an agent can ask about the résumé, projects, skills and the /now page in English or French. It is hand-written, stateless Streamable HTTP, and it reads its content from the `content.json` the frontend build emits.',
      fr: "`POST /mcp` est un serveur Model Context Protocol en lecture seule : un agent peut y interroger le CV, les projets, les compétences et la page /now, en anglais ou en français. C'est du Streamable HTTP sans état écrit à la main, qui lit son contenu dans le `content.json` produit par le build du frontend.",
    },
    hard: {
      en: [
        "Without the SDK, the JSON-RPC edge cases are the server's own. A batch is answered as an array and an empty one is an error; a notification or a stray client response gets no reply and the request a `202`; `GET` and `DELETE` get the `405` the transport prescribes. A failing tool returns `isError` in its result rather than a JSON-RPC error, as the protocol asks.",
        'The content has one source, `src/content`, but the two apps deploy separately. The résumé plugin emits a versioned `content.json`; the backend mirrors its shape in `mcp.types.ts` and refuses any version it was not written for. It accepts both 1 and 2, so either app can ship first.',
        'Fetching that file across apps must not make the tools fragile. It is cached for ten minutes behind a five-second timeout, and a stale copy is served when a refresh fails, so a frontend deploy in progress does not take the tools down.',
        'Like the other risky modules it is off by default: without `MCP_ENABLED` the route answers 404, as an unknown route would. Every tool is annotated `readOnlyHint`, the guard caps each IP at 60 requests a minute, and nothing asked is logged.',
      ],
      fr: [
        "Sans le SDK, les cas limites de JSON-RPC sont à la charge du serveur. Un lot reçoit un tableau de réponses et un lot vide est une erreur ; une notification ou une réponse égarée du client ne reçoit rien, et la requête un `202` ; `GET` comme `DELETE` obtiennent le `405` prévu par le transport. Un outil en échec renvoie `isError` dans son résultat plutôt qu'une erreur JSON-RPC, comme le veut le protocole.",
        "Le contenu n'a qu'une source, `src/content`, mais les deux applications se déploient séparément. Le plugin du CV produit un `content.json` versionné ; le backend en reproduit la forme dans `mcp.types.ts` et refuse toute version pour laquelle il n'a pas été écrit. Il accepte la 1 comme la 2, si bien que l'une ou l'autre application peut partir en premier.",
        "Aller chercher ce fichier chez l'autre application ne doit pas fragiliser les outils. Il est mis en cache dix minutes, avec un délai maximal de cinq secondes, et une copie périmée est servie si le rafraîchissement échoue : un déploiement du frontend en cours ne fait pas tomber les outils.",
        "Comme les autres modules sensibles, il est désactivé par défaut : sans `MCP_ENABLED`, la route répond 404, comme une route inconnue. Chaque outil porte l'annotation `readOnlyHint`, le guard limite chaque IP à 60 requêtes par minute, et rien de ce qui est demandé n'est journalisé.",
      ],
    },
    numbers: [
      { label: {
        en: 'Newest protocol version offered, of three',
        fr: 'Version du protocole la plus récente proposée, sur trois',
      }, value: '2025-06-18' },
      { label: {
        en: 'Requests per IP',
        fr: 'Requêtes par IP',
      }, value: '60 / min' },
      { label: {
        en: 'content.json cache lifetime',
        fr: 'Durée de cache de content.json',
      }, value: '10 min' },
      { label: {
        en: 'content.json fetch timeout',
        fr: 'Délai maximal de récupération de content.json',
      }, value: '5 s' },
    ],
    try: 'why mcp-sdk',
    code: [
      'backend/src/mcp/mcp.service.ts',
      'backend/src/mcp/mcp.controller.ts',
      'backend/src/mcp/mcp.content.ts',
      'backend/src/mcp/mcp.types.ts',
      'frontend/vite-plugins/resume.ts',
    ],
    spec: { doc: 'docs/superpowers/specs/2026-09-24-september-batch-design.md', anchor: 'backend' },
    decisions: ['mcp-sdk', 'ask-no-rag'],
  },
  {
    id: 'presence',
    name: {
      en: 'Live presence',
      fr: 'La présence en direct',
    },
    summary: {
      en: "The footer's head count is one integer pushed over server-sent events, with no visitor id anywhere in the system. The same integer adds one wireframe per other visitor to the three.js background.",
      fr: 'Le compteur du pied de page est un entier unique poussé en server-sent events, sans aucun identifiant de visiteur nulle part dans le système. Ce même entier ajoute au fond three.js une forme filaire par autre visiteur.',
    },
    hard: {
      en: [
        'The data model is the privacy guarantee. The server holds one number: a subscription to the Nest `@Sse()` stream increments it, and the teardown when the response closes decrements it, floored at zero against a double teardown. A unit test asserts the payload has exactly one key, so a field added beside `online` fails the suite.',
        'Each change is pushed at once to every open stream, and a `BehaviorSubject` replays the current figure to a new one. Apache closes idle connections, so a heartbeat resends the count every 25 seconds. The count lives in memory: a restart resets it, which is right, because every connection dies with the process.',
        '`EventSource` reconnects by itself, so the client counts failures and closes the stream after three instead of retrying for as long as the tab is open. The footer segment stays out of the DOM until a first message arrives, so a missing backend shows nothing rather than a zero.',
        'In the background, `visitorShapesFor` turns the count, minus the reader, into shapes, capped at 12 and kept in a pool of their own so `spawn` and `scene reset` keep their meaning. Arrivals fade in, departures fade out before being disposed, and a shape still fading out is taken back if someone arrives.',
      ],
      fr: [
        "Le modèle de données tient lieu de garantie de confidentialité. Le serveur ne garde qu'un nombre : un abonnement au flux `@Sse()` de Nest l'incrémente, et la libération qui suit la fermeture de la réponse le décrémente, sans descendre sous zéro en cas de double libération. Un test unitaire vérifie que la charge utile n'a qu'une seule clé : un champ ajouté à côté de `online` fait échouer les tests.",
        "Chaque changement est poussé aussitôt à tous les flux ouverts, et un `BehaviorSubject` renvoie le chiffre courant à chaque nouvel abonné. Apache coupe les connexions inactives, d'où un battement qui renvoie le compte toutes les 25 secondes. Le compteur vit en mémoire : un redémarrage le remet à zéro, ce qui est juste, puisque toutes les connexions meurent avec le processus.",
        "`EventSource` se reconnecte tout seul ; le client compte donc les échecs et ferme le flux au bout de trois, au lieu de réessayer tant que l'onglet reste ouvert. Le segment du pied de page n'entre dans le DOM qu'au premier message : sans backend, rien ne s'affiche, plutôt qu'un zéro.",
        "Dans le fond animé, `visitorShapesFor` convertit le compte, lecteur exclu, en formes, plafonnées à 12 et rangées dans un pool à part, pour que `spawn` et `scene reset` gardent leur sens. Les arrivées apparaissent en fondu, les départs s'estompent avant d'être libérés, et une forme en train de disparaître est récupérée si quelqu'un arrive.",
      ],
    },
    numbers: [
      { label: {
        en: 'Keys in the payload',
        fr: 'Clés dans la charge utile',
      }, value: '1' },
      { label: {
        en: 'Heartbeat interval',
        fr: 'Intervalle du battement',
      }, value: '25 s' },
      { label: {
        en: 'Failed connections before the client gives up',
        fr: 'Échecs de connexion avant que le client abandonne',
      }, value: '3' },
      { label: {
        en: 'Cap on visitor shapes',
        fr: 'Plafond de formes de visiteurs',
      }, value: '12' },
    ],
    try: 'systemctl status presence.service',
    code: [
      'backend/src/presence/presence.service.ts',
      'backend/src/presence/presence.types.ts',
      'frontend/src/composables/usePresence.ts',
      'frontend/src/composables/useSceneControl.ts',
      'frontend/src/components/ThreeBackground.vue',
    ],
    spec: { doc: 'docs/features-spec.md', anchor: 'get-presence--the-one-thing-that-pushes' },
    decisions: ['polling', 'rooms-sse'],
  },
  {
    id: 'wordlists',
    name: {
      en: 'The word lists',
      fr: 'Les listes de mots',
    },
    summary: {
      en: 'wordle, hangman and the typing test draw on lists generated from permissively licensed sources only: SCOWL for English, three sources combined for French. A script builds them, the output is committed, and each locale is a chunk fetched only when a word game runs.',
      fr: "wordle, hangman et le test de frappe puisent dans des listes générées uniquement à partir de sources sous licence permissive : SCOWL pour l'anglais, trois sources combinées pour le français. Un script les construit, le résultat est versionné, et chaque langue forme un chunk chargé seulement au lancement d'un jeu de mots.",
    },
    hard: {
      en: [
        "The licence constraint ruled out most of the obvious resources. Lexique383 and FrequencyWords' lists are share-alike, the latter behind a repository that advertises MIT; Monkeytype's lists are GPLv3; google-10000-english allows only educational and personal use; the Leipzig Corpora state different licences on different pages.",
        "SCOWL's size grades already split English the way the games need: size 35 for answers, 70 for accepted guesses, 10 for typing, British and American spellings both included. French has no such grading, so membership comes from an MIT word array, headwords from Grammalecte's hunspell dictionary, which removes conjugations, and frequency from Tatoeba's sentences, tokenised so that `qu'il` counts as `il`.",
        'Answers keep their accents, accepted guesses are stored already folded, and every comparison is on the folded form: NFD, combining marks removed, uppercase. French answers are deduplicated on that form, so `cote` and `côté` share one slot and the more frequent spelling takes it, and the script refuses to write a list in which any answer would be rejected as a guess.',
        'The script runs by hand and its output is committed, so the build stays reproducible offline and CI does not depend on tatoeba.org. The header is a `/*! @license` comment, which minifiers keep, because the MPL-2.0 and CC BY notices must survive into `dist/`. Each locale sits behind `import()` and is left out of the PWA precache.',
      ],
      fr: [
        "La contrainte de licence a écarté la plupart des ressources évidentes. Les listes de Lexique383 et de FrequencyWords sont en partage à l'identique, celles du second derrière un dépôt affiché sous MIT ; celles de Monkeytype sont sous GPLv3 ; google-10000-english n'autorise qu'un usage éducatif et personnel ; les corpus de Leipzig annoncent des licences différentes selon les pages.",
        "Les niveaux de taille de SCOWL découpent déjà l'anglais comme les jeux en ont besoin : taille 35 pour les réponses, 70 pour les propositions acceptées, 10 pour la frappe, orthographes britannique et américaine comprises. Le français n'a pas d'équivalent : l'appartenance vient d'un tableau de mots sous MIT, les lemmes du dictionnaire hunspell de Grammalecte, qui élimine les formes conjuguées, et la fréquence des phrases de Tatoeba, découpées de sorte que `qu'il` compte comme `il`.",
        "Les réponses gardent leurs accents, les propositions acceptées sont stockées déjà normalisées, et toute comparaison se fait sur la forme normalisée : NFD, diacritiques retirés, majuscules. Les réponses françaises sont dédoublonnées sur cette forme, si bien que `cote` et `côté` se partagent une place, prise par la graphie la plus fréquente, et le script refuse d'écrire une liste dont une réponse serait refusée comme proposition.",
        "Le script se lance à la main et son résultat est versionné : le build reste reproductible hors ligne et la CI ne dépend pas de tatoeba.org. L'en-tête est un commentaire `/*! @license`, que les minifieurs conservent, car les mentions MPL-2.0 et CC BY doivent survivre jusque dans `dist/`. Chaque langue est derrière un `import()` et exclue du précache de la PWA.",
      ],
    },
    numbers: [
      { label: {
        en: 'Letters in a wordle word',
        fr: "Lettres d'un mot de wordle",
      }, value: '5' },
      { label: {
        en: 'SCOWL sizes: answers / accepted / typing',
        fr: 'Tailles SCOWL : réponses / acceptés / frappe',
      }, value: '35 / 70 / 10' },
      { label: {
        en: 'Tatoeba occurrences for a French answer / typing word',
        fr: 'Occurrences Tatoeba pour une réponse / un mot à taper en français',
      }, value: '≥ 10 / ≥ 200' },
      { label: {
        en: 'Typing-test word length',
        fr: 'Longueur des mots du test de frappe',
      }, value: '2–9' },
    ],
    try: 'wordle daily',
    code: [
      'frontend/scripts/build-wordlists.mjs',
      'frontend/src/terminal/games/words.ts',
      'frontend/src/terminal/games/wordle.ts',
      'frontend/vite.config.ts',
    ],
    spec: { doc: 'docs/superpowers/specs/2026-08-07-terminal-games-vol2-design.md', anchor: 'addendum--real-word-lists' },
    decisions: ['word-lists'],
  },
]

export function findWork(id: string): WorkPart | undefined {
  return work.find((part) => part.id === id.toLowerCase())
}
