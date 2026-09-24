import type { Localised } from '@/content/types'

/**
 * UI chrome strings — labels, buttons, statuses. Page *content* lives in `src/content`;
 * this file is only for the shell around it.
 */
export const messages = {
  nav: {
    toggleMenu: { en: 'Toggle menu', fr: 'Ouvrir le menu' },
    language: { en: 'Switch language', fr: 'Changer de langue' },
  },
  hero: {
    aboutFile: { en: 'cat about.txt', fr: 'cat about.txt' },
    skills: { en: 'ls skills/', fr: 'ls skills/' },
  },
  projects: {
    recentActivity: { en: 'git log --oneline', fr: 'git log --oneline' },
    contributions: { en: 'contributions — last year', fr: 'contributions — 12 derniers mois' },
    less: { en: 'less', fr: 'moins' },
    more: { en: 'more', fr: 'plus' },
    justNow: { en: 'just now', fr: "à l'instant" },
    noDescription: { en: 'No description provided.', fr: 'Aucune description fournie.' },
  },
  build: {
    title: { en: 'gh run list', fr: 'gh run list' },
    running: { en: 'running', fr: 'en cours' },
    queued: { en: 'queued', fr: 'en attente' },
    success: { en: 'passed', fr: 'réussi' },
    failure: { en: 'failed', fr: 'échoué' },
    cancelled: { en: 'cancelled', fr: 'annulé' },
    unknown: { en: 'unknown', fr: 'inconnu' },
  },
  guestbookTicker: {
    signed: { en: 'just signed the guestbook', fr: "vient de signer le livre d'or" },
    read: { en: 'run `guestbook` to read it', fr: 'tapez `guestbook` pour le lire' },
  },
  music: {
    genres: { en: 'Genres', fr: 'Genres' },
    tools: { en: 'Tools', fr: 'Outils' },
    listen: { en: 'Listen on SoundCloud', fr: 'Écouter sur SoundCloud' },
  },
  gaming: {
    favouriteGenres: { en: 'Favourite genres', fr: 'Genres préférés' },
    platforms: { en: 'Platforms', fr: 'Plateformes' },
    liveFromSteam: { en: 'Live from Steam:', fr: 'En direct de Steam :' },
    recentLog: { en: 'Recent activity log:', fr: "Journal d'activité récent :" },
    inGame: { en: 'in-game', fr: 'en jeu' },
    viewProfile: { en: 'view full steam profile ↗', fr: 'voir le profil steam complet ↗' },
  },
  hardware: {
    pcs: { en: 'PCs', fr: 'PCs' },
    nas: { en: 'NAS', fr: 'NAS' },
    peripherals: { en: 'Peripherals', fr: 'Périphériques' },
  },
  contact: {
    // Rendered as `--<flag>` in the terminal-styled form — kept in English in both
    // locales, like every other fake command/file name in the UI.
    name: { en: 'name', fr: 'name' },
    email: { en: 'email', fr: 'email' },
    subject: { en: 'subject', fr: 'subject' },
    message: { en: 'message', fr: 'message' },
    namePlaceholder: { en: 'Jules', fr: 'Jules' },
    emailPlaceholder: { en: 'you@example.com', fr: 'vous@exemple.com' },
    subjectPlaceholder: { en: 'Hello there', fr: 'Bonjour' },
    messagePlaceholder: { en: 'Your message...', fr: 'Votre message...' },
    send: { en: '$ send --message', fr: '$ send --message' },
    sending: { en: 'Sending…', fr: 'Envoi…' },
    success: {
      en: "✓ Message sent! I'll get back to you shortly.",
      fr: '✓ Message envoyé ! Je reviens vers vous rapidement.',
    },
    error: {
      en: 'Failed to send message. Please try again or reach out directly by email.',
      fr: "Échec de l'envoi. Réessayez ou contactez-moi directement par email.",
    },
    directLine: { en: 'Prefer a direct line? Find me here:', fr: 'Vous préférez le contact direct ?' },
    resume: { en: 'Résumé', fr: 'CV' },
    resumeNote: { en: 'printable, or save as PDF', fr: 'à imprimer, ou en PDF' },
  },
  terminal: {
    open: { en: 'Open terminal', fr: 'Ouvrir le terminal' },
    close: { en: 'Close terminal', fr: 'Fermer le terminal' },
    maximise: { en: 'Maximise', fr: 'Agrandir' },
    minimise: { en: 'Minimise', fr: 'Réduire' },
    title: { en: 'terminal', fr: 'terminal' },
    inputLabel: { en: 'Terminal input', fr: 'Entrée du terminal' },
    hint: {
      en: "Type `help` to get started. Press Esc to close.",
      fr: 'Tapez `help` pour commencer. Échap pour fermer.',
    },
    welcome: {
      en: 'Welcome aboard. Some commands are not in `help` — go find them.',
      fr: "Bienvenue. Certaines commandes ne sont pas dans `help` — à vous de les trouver.",
    },
    notFound: {
      en: 'command not found',
      fr: 'commande introuvable',
    },
    didYouMean: { en: 'did you mean', fr: 'vouliez-vous dire' },
    // Shown instead of a typo suggestion when the input reads as a sentence.
    askInstead: { en: 'that reads like a question — try', fr: 'on dirait une question — essayez' },
    // One label for every game, so it can only name controls they all share.
    // `q` is not one of them: `wordle`, `hangman` and `wpm` read letters, and a
    // quit key that eats a guess is worse than no quit key. Esc and Ctrl+C both
    // abort a capture (see `onPanelKeydown`), and each game prints its own hint
    // line with the controls that are actually its own.
    playing: {
      en: '-- playing: esc or ctrl+c to quit --',
      fr: '-- en jeu : esc ou ctrl+c pour quitter --',
    },
    cancelled: { en: '^C cancelled', fr: '^C annulé' },
    // `{command}` is what the link asked for, echoed so the reader sees it.
    linkRefused: {
      en: 'a link asked to run `{command}` — that one only runs if you type it yourself.',
      fr: 'un lien a demandé `{command}` — celle-ci ne s’exécute que si vous la tapez vous-même.',
    },
    // Faded placeholder text at an empty prompt; `{command}` is from the registry.
    suggestion: { en: 'try: {command}', fr: 'essayez : {command}' },
  },
  // Chrome around `ask` only. The *answer* is generated in the requested locale
  // by the model itself and is never translated client-side.
  ask: {
    question: { en: 'what do you want to know?', fr: 'que voulez-vous savoir ?' },
    thinking: { en: 'thinking…', fr: 'réflexion…' },
    // Non-negotiable, and always the first line: a model paraphrasing someone's
    // CV in the first person without a label is a small lie.
    disclaimer: {
      en: 'a local model wrote this and it can be wrong — for the real answer, `mail`.',
      fr: 'un modèle local a écrit ceci et il peut se tromper — pour la vraie réponse, `mail`.',
    },
    asleep: {
      en: 'the model runs on a machine in my flat and it is currently asleep.',
      fr: 'le modèle tourne sur une machine dans mon appart, et il dort en ce moment.',
    },
    asleepHint: {
      en: 'try `mail` — that one reaches the human.',
      fr: 'essayez `mail` — celui-là atteint l’humain.',
    },
    busy: {
      en: 'one question at a time — the model lives in a flat, not a datacentre.',
      fr: 'une question à la fois — le modèle vit dans un appart, pas dans un datacentre.',
    },
  },
  palette: {
    placeholder: { en: 'Type a command or search…', fr: 'Tapez une commande ou cherchez…' },
    empty: { en: 'No matching command', fr: 'Aucune commande correspondante' },
    hint: { en: '↑↓ navigate · ↵ run · esc close', fr: '↑↓ naviguer · ↵ lancer · échap fermer' },
    open: { en: 'Command palette', fr: 'Palette de commandes' },
  },
  notFound: {
    back: { en: 'cd ~', fr: 'cd ~' },
    hint: {
      en: 'Or open the terminal and type `cd about`.',
      fr: 'Ou ouvrez le terminal et tapez `cd about`.',
    },
    ctf: {
      en: 'Not a page — a command. The chain starts in the terminal.',
      fr: 'Pas une page — une commande. La chaîne commence dans le terminal.',
    },
    ctfOpen: { en: 'Open the terminal and type `ctf`.', fr: 'Ouvrez le terminal et tapez `ctf`.' },
  },
  tools: {
    subtitle: {
      en: 'Small utilities that run entirely in your browser. Nothing you drop here is uploaded anywhere — there is no server on the other end.',
      fr: "Petits utilitaires qui tournent entièrement dans votre navigateur. Rien de ce que vous déposez ici n'est envoyé où que ce soit — il n'y a pas de serveur en face.",
    },
    list: { en: 'Available tools', fr: 'Outils disponibles' },
    tierClient: { en: 'in-browser', fr: 'navigateur' },
    tierWasm: { en: 'wasm', fr: 'wasm' },
    tierAdmin: { en: 'admin', fr: 'admin' },
    hint: {
      en: '`cd tools/<name>` in the terminal opens one; `cd ~` goes back.',
      fr: '`cd tools/<nom>` dans le terminal en ouvre un ; `cd ~` ramène à la page.',
    },
    copy: { en: 'copy', fr: 'copier' },
    copied: { en: 'copied', fr: 'copié' },
    download: { en: 'download', fr: 'télécharger' },
    input: { en: 'input', fr: 'entrée' },
    output: { en: 'output', fr: 'sortie' },
    dropFile: { en: 'Drop a file here, or', fr: 'Déposez un fichier ici, ou' },
    browse: { en: 'browse', fr: 'parcourir' },
    working: { en: 'working…', fr: 'en cours…' },
  },
  toolImage: {
    format: { en: 'format', fr: 'format' },
    quality: { en: 'quality', fr: 'qualité' },
    maxWidth: { en: 'max-width', fr: 'largeur-max' },
    original: { en: 'original', fr: 'original' },
    result: { en: 'result', fr: 'résultat' },
    unsupported: {
      en: 'This browser cannot encode that format; it will hand back a PNG, and the file will be named accordingly.',
      fr: 'Ce navigateur ne sait pas encoder ce format ; il rendra un PNG, et le fichier sera nommé en conséquence.',
    },
    notImage: {
      en: 'That is not an image this browser can decode.',
      fr: "Ce n'est pas une image que ce navigateur sait décoder.",
    },
    privacy: {
      en: 'Re-encoding through a canvas drops every metadata block — EXIF, GPS, colour profile — by construction, not by option.',
      fr: 'Repasser par un canvas supprime tous les blocs de métadonnées — EXIF, GPS, profil colorimétrique — par construction, pas par option.',
    },
  },
  toolHash: {
    text: { en: 'text', fr: 'texte' },
    file: { en: 'file', fr: 'fichier' },
    hex: { en: 'hex', fr: 'hex' },
    base64: { en: 'base64', fr: 'base64' },
    placeholder: { en: 'Type or paste anything…', fr: 'Tapez ou collez n’importe quoi…' },
  },
  toolEncode: {
    scheme: { en: 'scheme', fr: 'schéma' },
    invalid: { en: 'Not valid {scheme} input.', fr: 'Entrée {scheme} invalide.' },
    placeholder: { en: 'Type or paste…', fr: 'Tapez ou collez…' },
  },
  toolJson: {
    format: { en: 'format', fr: 'formater' },
    minify: { en: 'minify', fr: 'minifier' },
    indent: { en: 'indent', fr: 'indentation' },
    valid: { en: 'valid JSON', fr: 'JSON valide' },
    invalid: {
      en: 'line {line}, column {column}: {message}',
      fr: 'ligne {line}, colonne {column} : {message}',
    },
    invalidNoPosition: { en: 'invalid JSON — {message}', fr: 'JSON invalide — {message}' },
    placeholder: { en: 'Paste JSON…', fr: 'Collez du JSON…' },
    stats: { en: '{bytes} · {lines} lines', fr: '{bytes} · {lines} lignes' },
  },
  toolColour: {
    input: { en: 'colour', fr: 'couleur' },
    against: { en: 'against', fr: 'contre' },
    contrast: { en: 'contrast', fr: 'contraste' },
    presets: { en: 'against the site palette', fr: 'contre la palette du site' },
    invalid: {
      en: 'Not a colour this tool can read — try #00ff41, rgb(), hsl() or oklch().',
      fr: 'Pas une couleur que cet outil sait lire — essayez #00ff41, rgb(), hsl() ou oklch().',
    },
    placeholder: {
      en: '#00ff41, rgb(0 255 65), oklch(0.87 0.29 142)…',
      fr: '#00ff41, rgb(0 255 65), oklch(0.87 0.29 142)…',
    },
  },
  toolJwt: {
    input: { en: 'token', fr: 'jeton' },
    placeholder: { en: 'Paste a token — eyJ…', fr: 'Collez un jeton — eyJ…' },
    header: { en: 'header', fr: 'en-tête' },
    payload: { en: 'payload', fr: 'charge utile' },
    signature: { en: 'signature', fr: 'signature' },
    // The one thing this panel must say: it does not, and will not, verify.
    decodeOnly: {
      en: 'Decoded, not verified. Checking the signature needs the secret or the key, and a web page is no place to paste either.',
      fr: 'Décodé, pas vérifié. Vérifier la signature demande le secret ou la clé, et une page web n’est pas l’endroit où les coller.',
    },
    segments: {
      en: 'Not a JWT: expected three parts separated by dots.',
      fr: 'Pas un JWT : trois parties séparées par des points étaient attendues.',
    },
    base64: { en: '{segment}: not valid base64url.', fr: '{segment} : base64url invalide.' },
    json: { en: '{segment}: not a JSON object.', fr: '{segment} : pas un objet JSON.' },
    iat: { en: 'issued', fr: 'émis' },
    nbf: { en: 'not before', fr: 'pas avant' },
    exp: { en: 'expires', fr: 'expire' },
    expired: { en: 'expired', fr: 'expiré' },
    notYet: { en: 'not valid yet', fr: 'pas encore valide' },
    valid: { en: 'inside its validity window', fr: 'dans sa période de validité' },
    noExpiry: { en: 'no expiry', fr: 'sans expiration' },
    unsigned: { en: 'alg: none — this token is not signed at all.', fr: 'alg: none — ce jeton n’est pas signé du tout.' },
  },
  toolRegex: {
    pattern: { en: 'pattern', fr: 'motif' },
    flags: { en: 'flags', fr: 'options' },
    text: { en: 'test text', fr: 'texte de test' },
    placeholder: { en: 'Text to match against…', fr: 'Texte sur lequel chercher…' },
    matches: { en: '{n} matches', fr: '{n} correspondances' },
    one: { en: '1 match', fr: '1 correspondance' },
    none: { en: 'no match', fr: 'aucune correspondance' },
    truncated: { en: 'the first {n} are shown', fr: 'les {n} premières sont affichées' },
    group: { en: 'group', fr: 'groupe' },
    unmatched: { en: 'did not take part', fr: 'n’a pas participé' },
    timeout: {
      en: 'Stopped after a second: this pattern backtracks catastrophically on this text.',
      fr: 'Arrêté après une seconde : ce motif part en retour arrière catastrophique sur ce texte.',
    },
    flavour: {
      en: 'JavaScript (ECMAScript) syntax, run in a worker that is stopped after one second.',
      fr: 'Syntaxe JavaScript (ECMAScript), exécutée dans un worker arrêté au bout d’une seconde.',
    },
    g: { en: 'global — every match', fr: 'global — toutes les correspondances' },
    i: { en: 'ignore case', fr: 'ignorer la casse' },
    m: { en: 'multiline — ^ and $ per line', fr: 'multiligne — ^ et $ par ligne' },
    s: { en: 'dotAll — . matches newlines', fr: 'dotAll — . inclut les retours à la ligne' },
    u: { en: 'unicode', fr: 'unicode' },
    y: { en: 'sticky — only at lastIndex', fr: 'collant — seulement à lastIndex' },
  },
  toolCron: {
    input: { en: 'expression', fr: 'expression' },
    presets: { en: 'examples', fr: 'exemples' },
    next: { en: 'next runs, in {zone}', fr: 'prochaines exécutions, fuseau {zone}' },
    never: {
      en: 'Never — no date matches in the next four years.',
      fr: 'Jamais — aucune date ne correspond dans les quatre prochaines années.',
    },
    count: { en: 'Five fields expected, {n} found.', fr: 'Cinq champs attendus, {n} trouvés.' },
    reboot: {
      en: '@reboot runs when the machine starts: it has no calendar meaning.',
      fr: '@reboot s’exécute au démarrage de la machine : ce n’est pas une date.',
    },
    syntax: { en: 'Cannot read “{token}” in the {field} field.', fr: 'Impossible de lire « {token} » dans le champ {field}.' },
    range: { en: '“{token}” is out of range for the {field} field.', fr: '« {token} » est hors limites pour le champ {field}.' },
    step: { en: 'The step in “{token}” ({field}) is not usable.', fr: 'Le pas de « {token} » ({field}) est inutilisable.' },
    minute: { en: 'minute', fr: 'minute' },
    hour: { en: 'hour', fr: 'heure' },
    day: { en: 'day of month', fr: 'jour du mois' },
    month: { en: 'month', fr: 'mois' },
    weekday: { en: 'day of week', fr: 'jour de la semaine' },
    note: {
      en: 'Vixie cron rules: 0 and 7 are both Sunday, and when both day fields are set, either one matching is enough.',
      fr: 'Règles de Vixie cron : 0 et 7 sont tous deux dimanche, et quand les deux champs de jour sont renseignés, l’un ou l’autre suffit.',
    },
  },
  toolQr: {
    input: { en: 'text', fr: 'texte' },
    placeholder: { en: 'Text or a URL…', fr: 'Du texte ou une URL…' },
    level: { en: 'error correction', fr: 'correction d’erreur' },
    info: {
      en: 'version {version} · {size}×{size} modules · mask {mask} · {bytes} bytes',
      fr: 'version {version} · {size}×{size} modules · masque {mask} · {bytes} octets',
    },
    tooLong: {
      en: '{bytes} bytes is more than a QR code holds at level {ecl} ({max}).',
      fr: '{bytes} octets, c’est plus qu’un QR code n’en contient au niveau {ecl} ({max}).',
    },
    empty: { en: 'Type something to encode.', fr: 'Tapez quelque chose à encoder.' },
    png: { en: 'PNG', fr: 'PNG' },
    svg: { en: 'SVG', fr: 'SVG' },
    note: {
      en: 'Encoded here, from the standard: no library, no request. The code is black on white whatever the theme, because scanners want contrast.',
      fr: 'Encodé ici, d’après la norme : aucune bibliothèque, aucune requête. Noir sur blanc quel que soit le thème, parce que les lecteurs veulent du contraste.',
    },
  },
  toolDiff: {
    from: { en: 'original', fr: 'original' },
    to: { en: 'changed', fr: 'modifié' },
    identical: { en: 'identical', fr: 'identiques' },
    tooBig: {
      en: 'Too different to diff here without freezing the page.',
      fr: 'Trop différents pour être comparés ici sans figer la page.',
    },
    note: {
      en: 'The same line diff as the terminal’s `diff` command, printed as `diff -u` would.',
      fr: 'Le même diff ligne à ligne que la commande `diff` du terminal, affiché comme `diff -u`.',
    },
  },
  toolTime: {
    input: { en: 'time', fr: 'date' },
    now: { en: 'now', fr: 'maintenant' },
    local: { en: 'your zone', fr: 'votre fuseau' },
    relative: { en: 'relative', fr: 'relatif' },
    week: { en: 'ISO week', fr: 'semaine ISO' },
    day: { en: 'day', fr: 'jour' },
    zones: { en: 'around the world', fr: 'autour du monde' },
    invalid: {
      en: 'Not a time this tool can read — try an epoch, an ISO 8601 date, or “now”.',
      fr: 'Pas une date que cet outil sait lire — essayez un epoch, une date ISO 8601, ou « now ».',
    },
    placeholder: {
      en: '1700000000, 2026-09-22T12:00:00Z, now…',
      fr: '1700000000, 2026-09-22T12:00:00Z, now…',
    },
  },
  toolPassword: {
    password: { en: 'password', fr: 'mot de passe' },
    passphrase: { en: 'passphrase', fr: 'phrase secrète' },
    length: { en: 'length', fr: 'longueur' },
    lower: { en: 'a-z', fr: 'a-z' },
    upper: { en: 'A-Z', fr: 'A-Z' },
    digits: { en: '0-9', fr: '0-9' },
    symbols: { en: 'symbols', fr: 'symboles' },
    ambiguous: { en: 'allow look-alikes (l I 1 O 0 o)', fr: 'autoriser les sosies (l I 1 O 0 o)' },
    words: { en: 'words', fr: 'mots' },
    separator: { en: 'separator', fr: 'séparateur' },
    space: { en: 'space', fr: 'espace' },
    none: { en: 'none', fr: 'aucun' },
    capitalise: { en: 'capitalise', fr: 'majuscule initiale' },
    number: { en: 'add a digit', fr: 'ajouter un chiffre' },
    generate: { en: 'generate', fr: 'générer' },
    bits: { en: '{bits} bits of entropy', fr: '{bits} bits d’entropie' },
    weak: { en: 'weak', fr: 'faible' },
    fair: { en: 'fair', fr: 'passable' },
    strong: { en: 'strong', fr: 'solide' },
    excellent: { en: 'excellent', fr: 'excellent' },
    note: {
      en: 'Drawn from crypto.getRandomValues in your browser; nothing is sent or stored. Passphrases use the same common-word lists as the typing game.',
      fr: 'Tiré de crypto.getRandomValues dans votre navigateur ; rien n’est envoyé ni stocké. Les phrases secrètes utilisent les listes de mots courants du jeu de frappe.',
    },
  },
  toolText: {
    placeholder: { en: 'Paste or type some text…', fr: 'Collez ou tapez du texte…' },
    characters: { en: 'characters', fr: 'caractères' },
    noSpaces: { en: 'without spaces', fr: 'sans espaces' },
    words: { en: 'words', fr: 'mots' },
    lines: { en: 'lines', fr: 'lignes' },
    sentences: { en: 'sentences', fr: 'phrases' },
    paragraphs: { en: 'paragraphs', fr: 'paragraphes' },
    bytes: { en: 'bytes (UTF-8)', fr: 'octets (UTF-8)' },
    reading: { en: 'reading', fr: 'lecture' },
    speaking: { en: 'speaking', fr: 'à l’oral' },
    cases: { en: 're-case', fr: 'changer la casse' },
    frequency: { en: 'most frequent words', fr: 'mots les plus fréquents' },
    seconds: { en: '{n} s', fr: '{n} s' },
    minutes: { en: '{n} min', fr: '{n} min' },
  },
  toolFfmpeg: {
    intro: {
      en: 'This is ffmpeg compiled to WebAssembly, running in your browser: the file never leaves this machine. It first needs the ffmpeg core, a one-off download the browser keeps in its cache — and nothing is fetched until you press the button.',
      fr: "C'est ffmpeg compilé en WebAssembly, exécuté dans votre navigateur : le fichier ne quitte jamais cette machine. Il faut d'abord le cœur ffmpeg, un téléchargement unique que le navigateur garde en cache — et rien n'est récupéré avant d'appuyer sur le bouton.",
    },
    download: { en: 'download ffmpeg', fr: 'télécharger ffmpeg' },
    downloading: { en: 'downloading', fr: 'téléchargement' },
    starting: { en: 'starting ffmpeg…', fr: 'démarrage de ffmpeg…' },
    ready: { en: 'ffmpeg ready', fr: 'ffmpeg prêt' },
    loadFailed: {
      en: 'The core could not be downloaded or started. Reload the page and try again; a browser that blocks WebAssembly cannot run this tool.',
      fr: "Le cœur n'a pas pu être téléchargé ou démarré. Rechargez la page et réessayez ; un navigateur qui bloque WebAssembly ne peut pas exécuter cet outil.",
    },
    probing: { en: 'reading the file…', fr: 'lecture du fichier…' },
    notMedia: {
      en: 'ffprobe does not recognise this file as audio or video.',
      fr: "ffprobe ne reconnaît pas ce fichier comme de l'audio ou de la vidéo.",
    },
    format: { en: 'format', fr: 'format' },
    trim: { en: 'trim', fr: 'découpe' },
    start: { en: 'start', fr: 'début' },
    end: { en: 'end', fr: 'fin' },
    trimHint: {
      en: 'hh:mm:ss or seconds; empty means the whole file.',
      fr: 'hh:mm:ss ou secondes ; vide pour tout le fichier.',
    },
    badStart: {
      en: 'The start is not a timecode, or is past the end of the file.',
      fr: "Le début n'est pas un timecode, ou dépasse la fin du fichier.",
    },
    badEnd: { en: 'The end is not a timecode.', fr: "La fin n'est pas un timecode." },
    badOrder: { en: 'The end has to come after the start.', fr: 'La fin doit venir après le début.' },
    noAudio: { en: 'This file has no audio stream.', fr: "Ce fichier n'a pas de piste audio." },
    noVideo: {
      en: 'This file has no video stream; pick an audio format.',
      fr: "Ce fichier n'a pas de piste vidéo ; choisissez un format audio.",
    },
    copyUnknown: {
      en: 'No plain container for this audio codec here; pick a format that re-encodes.',
      fr: 'Pas de conteneur simple pour ce codec audio ici ; choisissez un format qui ré-encode.',
    },
    convert: { en: 'convert', fr: 'convertir' },
    cancel: { en: 'cancel', fr: 'annuler' },
    cancelled: { en: 'cancelled — restarting ffmpeg', fr: 'annulé — redémarrage de ffmpeg' },
    crashed: {
      en: 'ffmpeg crashed on this file and has been restarted; try another format.',
      fr: 'ffmpeg a planté sur ce fichier et a été redémarré ; essayez un autre format.',
    },
    failed: { en: 'ffmpeg exited with code', fr: 'ffmpeg a quitté avec le code' },
    result: { en: 'result', fr: 'résultat' },
    elapsed: { en: 'in', fr: 'en' },
    slow: {
      en: 'Video re-encoding is single-threaded WebAssembly: expect a few times the clip’s length on a laptop, more on a phone. Audio, and the copy preset, are quick.',
      fr: "Le ré-encodage vidéo est du WebAssembly mono-thread : comptez quelques fois la durée du clip sur un portable, plus sur un téléphone. L'audio, et le préréglage copy, sont rapides.",
    },
  },
  toolDownload: {
    locked: {
      en: 'This tool is the owner’s. Unlock it with the admin password — or `sudo -i` in the terminal.',
      fr: "Cet outil est celui du propriétaire. Déverrouillez-le avec le mot de passe admin — ou `sudo -i` dans le terminal.",
    },
    password: { en: 'admin password', fr: 'mot de passe admin' },
    unlock: { en: 'unlock', fr: 'déverrouiller' },
    lock: { en: 'lock', fr: 'verrouiller' },
    wrong: { en: 'Sorry, try again.', fr: 'Désolé, réessayez.' },
    unreachable: {
      en: 'The API cannot be reached to check that.',
      fr: "Impossible de joindre l'API pour vérifier.",
    },
    off: {
      en: 'The downloader is off on this deployment — DOWNLOADER_ENABLED, and yt-dlp on the box.',
      fr: 'Le téléchargeur est désactivé sur ce déploiement — DOWNLOADER_ENABLED, et yt-dlp sur la machine.',
    },
    intro: {
      en: 'One YouTube video or one SoundCloud track per job — never a set or a profile, which is how this host earned an hour-long block. The server fetches it as mp3, hands it over once, and deletes it.',
      fr: "Une vidéo YouTube ou un morceau SoundCloud par tâche — jamais une playlist ni un profil, c'est ainsi que cet hébergeur s'est fait bloquer une heure. Le serveur le récupère en mp3, le remet une fois, puis l'efface.",
    },
    url: { en: 'YouTube or SoundCloud link', fr: 'lien YouTube ou SoundCloud' },
    start: { en: 'download', fr: 'télécharger' },
    starting: { en: 'starting…', fr: 'démarrage…' },
    jobs: { en: 'Downloads', fr: 'Téléchargements' },
    queued: { en: 'queued', fr: 'en attente' },
    running: { en: 'downloading', fr: 'téléchargement' },
    done: { en: 'ready', fr: 'prêt' },
    failed: { en: 'failed', fr: 'échec' },
    fetch: { en: 'save', fr: 'enregistrer' },
    fetching: { en: 'fetching…', fr: 'récupération…' },
    cancel: { en: 'cancel', fr: 'annuler' },
    remove: { en: 'dismiss', fr: 'fermer' },
    empty: { en: 'No downloads yet.', fr: 'Aucun téléchargement.' },
    ttl: {
      en: 'A file waits on the server for 30 minutes at most, and is gone the moment it is saved.',
      fr: "Un fichier attend au plus 30 minutes sur le serveur, et disparaît dès qu'il est enregistré.",
    },
  },
  rooms: {
    introWatch: {
      en: 'A watch party: one code, one YouTube video, everyone at the same second. The host presses play; every other player follows.',
      fr: "Une soirée vidéo : un code, une vidéo YouTube, tout le monde à la même seconde. L'hôte appuie sur lecture ; tous les autres lecteurs suivent.",
    },
    introRadio: {
      en: 'A shared radio: a queue of SoundCloud tracks the host runs, and every listener hears the same one at the same time.',
      fr: "Une radio partagée : une file de morceaux SoundCloud que l'hôte enchaîne, et chaque auditeur entend le même au même moment.",
    },
    lobby: { en: 'Rooms', fr: 'Salons' },
    host: { en: 'host', fr: 'hôte' },
    guest: { en: 'guest', fr: 'invité' },
    hostHint: {
      en: 'Start a room and share its code or link. Your player drives everyone else’s.',
      fr: 'Ouvrez un salon et partagez son code ou son lien. Votre lecteur pilote tous les autres.',
    },
    guestHint: {
      en: 'Got a code? Type it, or paste the link.',
      fr: 'Vous avez un code ? Tapez-le, ou collez le lien.',
    },
    create: { en: 'start a room', fr: 'ouvrir un salon' },
    creating: { en: 'starting…', fr: 'ouverture…' },
    createFailed: { en: 'Could not start a room:', fr: "Impossible d'ouvrir un salon :" },
    join: { en: 'join', fr: 'rejoindre' },
    joining: { en: 'joining', fr: 'connexion' },
    codePlaceholder: { en: 'code or link', fr: 'code ou lien' },
    badCode: { en: 'A code is five letters or digits.', fr: 'Un code fait cinq lettres ou chiffres.' },
    off: {
      en: 'Rooms are off on this deployment.',
      fr: 'Les salons sont désactivés sur ce déploiement.',
    },
    gone: {
      en: 'This room has ended — or never existed.',
      fr: "Ce salon est terminé — ou n'a jamais existé.",
    },
    lost: { en: 'Connection lost.', fr: 'Connexion perdue.' },
    retry: { en: 'retry', fr: 'réessayer' },
    leave: { en: 'leave', fr: 'quitter' },
    end: { en: 'end room', fr: 'fermer le salon' },
    members: { en: 'here', fr: 'ici' },
    youAreHost: {
      en: 'You are the host: your player drives the room.',
      fr: "Vous êtes l'hôte : votre lecteur pilote le salon.",
    },
    youAreGuest: {
      en: 'The host drives; your player follows. If it does not start, press play once.',
      fr: "L'hôte pilote ; votre lecteur suit. S'il ne démarre pas, appuyez une fois sur lecture.",
    },
    inputWatch: { en: 'YouTube link or video id', fr: 'lien YouTube ou identifiant de vidéo' },
    inputRadio: { en: 'soundcloud.com track or set link', fr: 'lien soundcloud.com (morceau ou playlist)' },
    badLinkWatch: {
      en: 'That is not a YouTube link or video id.',
      fr: "Ce n'est pas un lien YouTube ni un identifiant de vidéo.",
    },
    badLinkRadio: {
      en: 'That is not a soundcloud.com track or set link.',
      fr: "Ce n'est pas un lien soundcloud.com de morceau ou de playlist.",
    },
    playNow: { en: 'play now', fr: 'lire maintenant' },
    enqueue: { en: 'queue', fr: 'en file' },
    next: { en: 'next', fr: 'suivant' },
    upNext: { en: 'up next', fr: 'à suivre' },
    play: { en: 'play', fr: 'lecture' },
    pause: { en: 'pause', fr: 'pause' },
    remove: { en: 'remove', fr: 'retirer' },
    nothing: { en: 'Nothing loaded yet — paste a link below.', fr: 'Rien de chargé — collez un lien ci-dessous.' },
    waiting: { en: 'Waiting for the host…', fr: "En attente de l'hôte…" },
    privacy: {
      en: 'A room is a code, a playback state and a head count. No names, no ids, nothing stored: it lives in the server’s memory and is gone two hours after the last action.',
      fr: "Un salon, c'est un code, un état de lecture et un nombre de présents. Ni noms, ni identifiants, rien d'enregistré : il vit dans la mémoire du serveur et disparaît deux heures après la dernière action.",
    },
  },
  // Chrome for `ctf`, `flag` and `decrypt`. Stage titles, hints and rewards live on
  // the stages themselves (terminal/ctf.ts), the way achievements carry their own.
  ctf: {
    board: { en: 'ctf — {n}/{total} flags', fr: 'ctf — {n}/{total} flags' },
    hint: { en: 'hint', fr: 'indice' },
    submit: { en: 'submit a flag with `flag CTF{…}`', fr: 'soumettez un flag avec `flag CTF{…}`' },
    usage: { en: 'usage: flag CTF{…}', fr: 'usage : flag CTF{…}' },
    malformed: {
      en: 'flag: that is not a flag — they look like CTF{0123456789abcdef}',
      fr: 'flag : ce n’est pas un flag — ils ressemblent à CTF{0123456789abcdef}',
    },
    wrong: { en: 'flag: unknown flag', fr: 'flag : flag inconnu' },
    order: { en: 'flag: out of order — you’re on stage {n}', fr: 'flag : pas dans l’ordre — vous en êtes à l’étape {n}' },
    already: { en: 'flag: stage {n} is already solved', fr: 'flag : l’étape {n} est déjà résolue' },
    solved: { en: 'stage {n} solved: {title}', fr: 'étape {n} résolue : {title}' },
    nudge: { en: 'still stuck? a sharper hint:', fr: 'toujours bloqué ? un indice plus précis :' },
    complete: {
      en: 'the chain is complete. nothing else hides here — mention `root` when you write.',
      fr: 'la chaîne est complète. plus rien ne se cache ici — mentionnez `root` en écrivant.',
    },
    missing: { en: 'decrypt: missing key material — {n} of 7 flags', fr: 'decrypt : clé incomplète — {n} flags sur 7' },
    missingStages: { en: 'still missing stages', fr: 'étapes manquantes :' },
    corrupt: {
      en: 'decrypt: the key does not fit. those flags were not captured here.',
      fr: 'decrypt : la clé ne correspond pas. ces flags n’ont pas été capturés ici.',
    },
    reopened: { en: '(already solved — the message does not change)', fr: '(déjà résolu — le message ne change pas)' },
  },
  now: {
    heading: { en: 'What I’m doing now', fr: 'Ce que je fais en ce moment' },
    updated: { en: 'Last updated', fr: 'Mis à jour le' },
    // `{n}` is the list's age in days. Shown instead of letting an old list pass
    // for a current one — the only honest way a /now page survives neglect.
    stale: {
      en: 'This list is {n} days old. Some of it is probably no longer true.',
      fr: 'Cette liste date de {n} jours. Une partie n’est sans doute plus vraie.',
    },
    about: { en: 'A /now page, as in', fr: 'Une page /now, comme sur' },
  },
  footer: {
    built: { en: 'built', fr: 'build' },
    source: { en: 'source', fr: 'source' },
    nominal: { en: 'all systems nominal', fr: 'tous les systèmes sont nominaux' },
    status: { en: 'Site status', fr: 'État du site' },
    // `{n}` is substituted by the caller — the count is aggregate, and there is
    // never anything to say about who the others are.
    online: { en: '{n} here now', fr: '{n} personnes ici' },
    onlineOne: { en: 'just you here', fr: 'vous seul ici' },
  },
  boot: {
    skip: { en: 'press any key to skip', fr: 'appuyez sur une touche pour passer' },
  },
  achievements: {
    title: { en: 'Achievements', fr: 'Succès' },
    open: { en: 'View achievements', fr: 'Voir les succès' },
    close: { en: 'Close achievements', fr: 'Fermer les succès' },
    toastPrefix: { en: 'Achievement unlocked:', fr: 'Succès débloqué :' },
  },
} satisfies Record<string, Record<string, Localised>>
