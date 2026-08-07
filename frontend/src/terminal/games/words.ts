/**
 * Five-letter word lists for `wordle` and `hangman`, one per locale.
 *
 * **Why this is not in `src/content/`.** That layer is the single source of truth
 * for *site copy*, and it is imported by `vite.config.ts` and the résumé plugin
 * outside the app's module graph — so every `resume.txt` build would parse a few
 * hundred words it can never emit, and the next person would reasonably read
 * "anything without a DOM dependency belongs in content/" into the precedent. The
 * purity rule there is a consequence of what lives in it, not the definition of
 * it. This module is equally pure and is where a reader would look for it.
 *
 * These are facts, not copy, so they are plain `string[]` per the i18n rule — the
 * locale picks a list rather than each entry carrying a translation. A French
 * word is not the translation of an English one; it is a different puzzle.
 *
 * French words are stored **spelled properly, accents included**. `fold()` in
 * `wordle.ts` strips them for comparison, so `EPEES` is an accepted way to type
 * `ÉPÉES` — a wordle where you have to find the accent key is a worse game, but
 * one that prints `EPEES` back at a French speaker is just wrong. Hence: correct
 * on display, forgiving on input. Note that `Œ` is deliberately absent from the
 * list (`COEUR`, `SOEUR`, `OEUFS`), because the ligature is one glyph in some
 * fonts and two in others, and a five-letter grid cannot survive that ambiguity.
 */

import type { Locale } from '@/content/types'

/** The words that can be the answer. Kept to ones a non-native speaker has a fair
 *  shot at: no proper nouns, no conjugated verbs beyond the infinitive, nothing
 *  needing a dictionary. */
const ANSWERS: Record<Locale, string[]> = {
  en: [
    'ABOUT', 'ADMIN', 'AGENT', 'ALARM', 'ALBUM', 'ALIGN', 'ALLOY', 'ALONE', 'AMBER', 'ANGLE',
    'ARRAY', 'ARROW', 'ASSET', 'AUDIO', 'AUDIT', 'AVOID', 'AWARD', 'BADGE', 'BASIC', 'BEACH',
    'BEGIN', 'BLAME', 'BLANK', 'BLEND', 'BLOCK', 'BOARD', 'BRAIN', 'BRAND', 'BRAVE', 'BREAD',
    'BREAK', 'BRICK', 'BRIEF', 'BRING', 'BROAD', 'BUILD', 'CABLE', 'CACHE', 'CANDY', 'CARGO',
    'CATCH', 'CAUSE', 'CHAIN', 'CHAIR', 'CHALK', 'CHARM', 'CHART', 'CHASE', 'CHEAP', 'CHECK',
    'CHESS', 'CHIEF', 'CHILD', 'CLAIM', 'CLASS', 'CLEAN', 'CLEAR', 'CLICK', 'CLIMB', 'CLOCK',
    'CLOSE', 'CLOUD', 'COAST', 'COUNT', 'COVER', 'CRAFT', 'CRASH', 'CRAWL', 'CREAM', 'CROWD',
    'CROWN', 'CURVE', 'CYCLE', 'DAILY', 'DANCE', 'DEBUG', 'DELAY', 'DEPTH', 'DIARY', 'DIRTY',
    'DOUBT', 'DRAFT', 'DREAM', 'DRIVE', 'EAGER', 'EARLY', 'EARTH', 'EIGHT', 'ELDER', 'EMPTY',
    'ENJOY', 'ENTER', 'EQUAL', 'ERROR', 'EVENT', 'EVERY', 'EXACT', 'EXIST', 'EXTRA', 'FAITH',
    'FALSE', 'FANCY', 'FAULT', 'FEAST', 'FENCE', 'FIBRE', 'FIELD', 'FIFTY', 'FIGHT', 'FINAL',
    'FIRST', 'FLAME', 'FLASH', 'FLEET', 'FLOOR', 'FLUID', 'FOCUS', 'FORCE', 'FRAME', 'FRESH',
    'FRONT', 'FRUIT', 'FUNNY', 'GHOST', 'GIANT', 'GLASS', 'GLOBE', 'GRACE', 'GRADE', 'GRAIN',
    'GRAND', 'GRAPH', 'GRASP', 'GREAT', 'GREEN', 'GROUP', 'GUARD', 'GUESS', 'GUEST', 'GUIDE',
    'HABIT', 'HAPPY', 'HEART', 'HEAVY', 'HONEY', 'HORSE', 'HOTEL', 'HOUSE', 'HUMAN', 'HUMID',
    'IDEAL', 'IMAGE', 'INDEX', 'INNER', 'INPUT', 'ISSUE', 'JELLY', 'JOINT', 'JUDGE', 'KNIFE',
    'KNOCK', 'LABEL', 'LARGE', 'LASER', 'LATER', 'LAUGH', 'LAYER', 'LEARN', 'LEASE', 'LEAST',
    'LEAVE', 'LEGAL', 'LEMON', 'LEVEL', 'LIGHT', 'LIMIT', 'LINEN', 'LOCAL', 'LOGIC', 'LOOSE',
    'LOWER', 'LUCKY', 'LUNCH', 'MAGIC', 'MAJOR', 'MARCH', 'MATCH', 'MAYBE', 'MEDAL', 'MEDIA',
    'MERCY', 'MERGE', 'METAL', 'METER', 'MIGHT', 'MINOR', 'MODEL', 'MONEY', 'MONTH', 'MORAL',
    'MOTOR', 'MOUNT', 'MOUSE', 'MOUTH', 'MOVIE', 'MUSIC', 'NERVE', 'NEVER', 'NIGHT', 'NOBLE',
    'NOISE', 'NORTH', 'NOVEL', 'NURSE', 'OCEAN', 'OFFER', 'ORBIT', 'ORDER', 'OTHER', 'OUTER',
    'OWNER', 'PAINT', 'PANEL', 'PAPER', 'PARSE', 'PARTY', 'PATCH', 'PEACE', 'PEARL', 'PHASE',
    'PHONE', 'PHOTO', 'PIANO', 'PIECE', 'PILOT', 'PITCH', 'PIXEL', 'PLACE', 'PLAIN', 'PLANE',
    'PLANT', 'PLATE', 'POINT', 'PORCH', 'POUND', 'POWER', 'PRESS', 'PRICE', 'PRIDE', 'PRIME',
    'PRINT', 'PRIOR', 'PRIZE', 'PROOF', 'PROUD', 'PROVE', 'PULSE', 'QUEEN', 'QUERY', 'QUEUE',
    'QUICK', 'QUIET', 'QUITE', 'RADIO', 'RAISE', 'RANGE', 'RAPID', 'RATIO', 'REACH', 'REACT',
    'READY', 'REALM', 'REBEL', 'REPLY', 'RIDGE', 'RIGHT', 'RIVAL', 'RIVER', 'ROBOT', 'ROUGH',
    'ROUND', 'ROUTE', 'ROYAL', 'RURAL', 'SALAD', 'SCALE', 'SCENE', 'SCOPE', 'SCORE', 'SCRAP',
    'SENSE', 'SERVE', 'SEVEN', 'SHADE', 'SHAKE', 'SHALL', 'SHAPE', 'SHARE', 'SHARP', 'SHEEP',
    'SHEET', 'SHELF', 'SHELL', 'SHIFT', 'SHINE', 'SHIRT', 'SHOCK', 'SHOOT', 'SHORE', 'SHORT',
    'SIGHT', 'SILLY', 'SINCE', 'SIXTY', 'SKILL', 'SLEEP', 'SLIDE', 'SMALL', 'SMART', 'SMILE',
    'SMOKE', 'SNAKE', 'SOLAR', 'SOLID', 'SOLVE', 'SORRY', 'SOUND', 'SOUTH', 'SPACE', 'SPARE',
    'SPEAK', 'SPEED', 'SPEND', 'SPICE', 'SPINE', 'SPLIT', 'SPOKE', 'SPORT', 'STACK', 'STAFF',
    'STAGE', 'STAIR', 'STAKE', 'STAMP', 'STAND', 'START', 'STATE', 'STEAM', 'STEEL', 'STICK',
    'STILL', 'STOCK', 'STONE', 'STORE', 'STORM', 'STORY', 'STOVE', 'STYLE', 'SUGAR', 'SUITE',
    'SUPER', 'SWEET', 'SWIFT', 'SWORD', 'TABLE', 'TASTE', 'TEACH', 'TEETH', 'THANK', 'THEFT',
    'THEIR', 'THEME', 'THERE', 'THICK', 'THING', 'THINK', 'THIRD', 'THOSE', 'THREE', 'THROW',
    'TIGER', 'TIGHT', 'TIMER', 'TITLE', 'TODAY', 'TOKEN', 'TOOTH', 'TOPIC', 'TOTAL', 'TOUCH',
    'TOUGH', 'TOWER', 'TRACE', 'TRACK', 'TRADE', 'TRAIL', 'TRAIN', 'TREAT', 'TREND', 'TRIAL',
    'TRIBE', 'TRICK', 'TRUCK', 'TRUST', 'TRUTH', 'TWICE', 'UNCLE', 'UNDER', 'UNION', 'UNITY',
    'UNTIL', 'UPPER', 'URBAN', 'USAGE', 'USUAL', 'VALID', 'VALUE', 'VIDEO', 'VIRUS', 'VISIT',
    'VITAL', 'VOICE', 'WASTE', 'WATCH', 'WATER', 'WHEAT', 'WHEEL', 'WHERE', 'WHICH', 'WHILE',
    'WHITE', 'WHOLE', 'WHOSE', 'WOMAN', 'WORLD', 'WORRY', 'WORSE', 'WORTH', 'WOULD', 'WOUND',
    'WRITE', 'WRONG', 'YIELD', 'YOUNG', 'YOUTH',
  ],
  fr: [
    'ACIDE', 'ADIEU', 'AGENT', 'AIGLE', 'AIMER', 'AINSI', 'ALBUM', 'ALLER', 'ALLIÉ', 'AMOUR',
    'AMPLE', 'ANGLE', 'ANNÉE', 'APPEL', 'APRÈS', 'ARBRE', 'ARMÉE', 'ASSEZ', 'ATOUT', 'AUCUN',
    'AUTRE', 'AVANT', 'AVION', 'AVOIR', 'AVRIL', 'BAGUE', 'BAINS', 'BALAI', 'BANDE', 'BARBE',
    'BASSE', 'BÂTON', 'BEAUX', 'BELLE', 'BILAN', 'BLANC', 'BLEUE', 'BOIRE', 'BOÎTE', 'BONNE',
    'BORNE', 'BOULE', 'BRAVE', 'BRUIT', 'BRUME', 'CADRE', 'CALME', 'CANAL', 'CARTE', 'CASSE',
    'CAUSE', 'CÉDER', 'CELUI', 'CHAIR', 'CHAMP', 'CHANT', 'CHAUD', 'CHIEN', 'CHOIX', 'CHOSE',
    'CIBLE', 'CIEUX', 'CLAIR', 'CLEFS', 'COEUR', 'COINS', 'COLLE', 'COMTE', 'CONTE', 'CORDE',
    'CORPS', 'CÔTES', 'COUPE', 'COURS', 'COURT', 'CRAIE', 'CRÉER', 'CREUX', 'CRISE', 'CROIX',
    'CUIRE', 'DAMES', 'DANSE', 'DÉBUT', 'DÉCOR', 'DEMIE', 'DENTS', 'DÉSIR', 'DETTE', 'DIGNE',
    'DIVIN', 'DOIGT', 'DONNE', 'DOSES', 'DOUCE', 'DOUTE', 'DRAME', 'DROIT', 'DURÉE', 'ÉCOLE',
    'ÉCRAN', 'ÉCRIT', 'EFFET', 'ÉGARD', 'ÉLÈVE', 'EMAIL', 'ENFIN', 'ENGIN', 'ENTRE', 'ÉPÉES',
    'ESSAI', 'ÉTAGE', 'ÉTANG', 'ÉTATS', 'ÉTUDE', 'EXACT', 'EXCÈS', 'FAÇON', 'FAIRE', 'FAITS',
    'FAUTE', 'FEMME', 'FERME', 'FÊTES', 'FIBRE', 'FIÈRE', 'FILET', 'FILLE', 'FINIR', 'FLEUR',
    'FLÛTE', 'FOIRE', 'FONDS', 'FORCE', 'FORÊT', 'FORME', 'FORTE', 'FOULE', 'FOYER', 'FRAIS',
    'FREIN', 'FROID', 'FRUIT', 'FUITE', 'FUMÉE', 'GAGNE', 'GARDE', 'GARES', 'GENRE', 'GESTE',
    'GLACE', 'GORGE', 'GOÛTS', 'GRÂCE', 'GRAIN', 'GRAND', 'GRAVE', 'GUIDE', 'HABIT', 'HAINE',
    'HAUTE', 'HERBE', 'HEURE', 'HIVER', 'HOMME', 'HONTE', 'HÔTEL', 'HUILE', 'IDÉAL', 'IDÉES',
    'ÎLOTS', 'IMAGE', 'INDEX', 'JAUNE', 'JETER', 'JEUNE', 'JOIES', 'JOLIE', 'JOUER', 'JOURS',
    'JUGES', 'JUPES', 'JUSTE', 'LAINE', 'LAMPE', 'LANCE', 'LARGE', 'LARME', 'LÉGER', 'LEVER',
    'LIBRE', 'LIENS', 'LIEUX', 'LIGNE', 'LISTE', 'LIVRE', 'LOGER', 'LONGS', 'LOURD', 'LUNDI',
    'LUNES', 'MAGIE', 'MAINS', 'MAIRE', 'MARDI', 'MARIÉ', 'MASSE', 'MATCH', 'MATIN', 'MÊLER',
    'MÊMES', 'MENER', 'MERCI', 'MÈRES', 'MÉTAL', 'MÈTRE', 'MIDIS', 'MIEUX', 'MILLE', 'MINCE',
    'MODES', 'MOINS', 'MONDE', 'MONTS', 'MORTS', 'MOTIF', 'MOULE', 'MOYEN', 'MÛRES', 'MUSÉE',
    'NAGER', 'NAÏFS', 'NEIGE', 'NERFS', 'NOBLE', 'NOCES', 'NOIRE', 'NOTES', 'NOTRE', 'NUAGE',
    'NUITS', 'OBJET', 'OCÉAN', 'ODEUR', 'OEUFS', 'OMBRE', 'ONCLE', 'ONDES', 'ORAGE', 'ORDRE',
    'OUTIL', 'PAGES', 'PAINS', 'PAIRE', 'PANNE', 'PARCS', 'PARLE', 'PARMI', 'PARTS', 'PASSE',
    'PATTE', 'PAUSE', 'PAYER', 'PEAUX', 'PÊCHE', 'PEINE', 'PENSE', 'PENTE', 'PERDU', 'PÈRES',
    'PERLE', 'PESER', 'PETIT', 'PHARE', 'PHASE', 'PHOTO', 'PIANO', 'PIÈCE', 'PIEDS', 'PILES',
    'PISTE', 'PLACE', 'PLAGE', 'PLANS', 'PLATS', 'PLEIN', 'PLIER', 'PLUIE', 'POCHE', 'POÈME',
    'POIDS', 'POING', 'POINT', 'POIRE', 'POMME', 'PONTS', 'PORTE', 'POSER', 'POSTE', 'POUCE',
    'POULE', 'PRÊTS', 'PRISE', 'PRIVÉ', 'PROIE', 'PUITS', 'QUART', 'QUEUE', 'RACES', 'RADIO',
    'RANGS', 'RARES', 'RECUL', 'RÈGLE', 'REINE', 'RENDU', 'RENTE', 'REPAS', 'RESTE', 'RÊVER',
    'RÊVES', 'RICHE', 'RIRES', 'RIVES', 'ROBES', 'ROCHE', 'ROMAN', 'RONDE', 'ROSES', 'ROUES',
    'ROUGE', 'ROUTE', 'RUDES', 'RUINE', 'SABLE', 'SACRÉ', 'SAGES', 'SAINT', 'SALLE', 'SALUT',
    'SANTÉ', 'SAUCE', 'SAUTS', 'SCÈNE', 'SEINS', 'SELON', 'SEMER', 'SENTI', 'SÉRIE', 'SERRE',
    'SEUIL', 'SEULE', 'SIÈGE', 'SIGNE', 'SILEX', 'SINON', 'SOEUR', 'SOIES', 'SOINS', 'SOIRS',
    'SOLDE', 'SOMME', 'SONGE', 'SORTE', 'SOUPE', 'SOURD', 'SPORT', 'STADE', 'STYLE', 'SUCRE',
    'SUITE', 'SUJET', 'TABLE', 'TACHE', 'TALON', 'TANTE', 'TAPIS', 'TASSE', 'TEINT', 'TEMPS',
    'TENIR', 'TENTE', 'TERME', 'TERRE', 'TESTS', 'TÊTES', 'THÈME', 'TIERS', 'TIGES', 'TIRER',
    'TISSU', 'TITRE', 'TOILE', 'TOITS', 'TOMBE', 'TORTS', 'TOTAL', 'TOURS', 'TRACE', 'TRAIN',
    'TRAIT', 'TRIBU', 'TRIER', 'TROIS', 'TRONC', 'TROUS', 'TUBES', 'TUILE', 'USAGE', 'USINE',
    'UTILE', 'VAGUE', 'VALSE', 'VASTE', 'VENIR', 'VENTS', 'VERBE', 'VERRE', 'VERSE', 'VERTE',
    'VESTE', 'VEUVE', 'VIDES', 'VIEIL', 'VIGNE', 'VILLE', 'VINGT', 'VISER', 'VIVRE', 'VOEUX',
    'VOILÀ', 'VOILE', 'VOLER', 'VOTRE', 'VRAIE', 'ZONES',
  ],
}

/**
 * Guesses accepted but never chosen as the answer. Kept separate so the answer
 * pool stays words a player will not feel cheated by, while the guess pool is
 * wide enough that a reasonable opener is rarely refused.
 */
const EXTRA_GUESSES: Record<Locale, string[]> = {
  en: [
    'ADIEU', 'AISLE', 'ANGRY', 'BLIMP', 'BLUNT', 'BOUGH', 'CANOE', 'CHOIR', 'CIVIC', 'CRANE',
    'CRATE', 'CROAK', 'DEALT', 'DODGE', 'DWELT', 'EMCEE', 'EPOXY', 'FJORD', 'FLUKE', 'GAUZE',
    'GLYPH', 'GNOME', 'GRIME', 'HAVOC', 'HYMNS', 'IRATE', 'JOKER', 'KAZOO', 'KNEAD', 'LATHE',
    'LOUSE', 'LYRIC', 'MIRTH', 'MOTTO', 'NYMPH', 'OAKEN', 'OZONE', 'PLUMB', 'PROXY', 'QUACK',
    'QUALM', 'QUIRK', 'RAJAH', 'RHYME', 'ROAST', 'SALTY', 'SCION', 'SHARD', 'SIEGE', 'SLOTH',
    'STEIN', 'SYRUP', 'TAWNY', 'THIGH', 'TRYST', 'UNFIT', 'VAULT', 'VIXEN', 'WALTZ', 'WHARF',
    'WHIRL', 'WOVEN', 'XENON', 'YACHT', 'ZEBRA', 'ZESTY', 'ZONAL',
  ],
  fr: [
    'ABBÉS', 'ACRES', 'ADAGE', 'AGATE', 'AJOUT', 'ALIAS', 'ALOÈS', 'AMBRE', 'AUBES', 'AVOUÉ',
    'AZURS', 'BADGE', 'BAHUT', 'BIAIS', 'BIJOU', 'BOXER', 'CHOUX', 'CIRES', 'CLOUS', 'COQUE',
    'CRABE', 'CYCLE', 'DÉDIÉ', 'DUVET', 'ÉCHOS', 'ÉTAUX', 'EXILS', 'FAUNE', 'FJORD', 'FUGUE',
    'GEÔLE', 'GIVRE', 'GOMME', 'GRAAL', 'HAMAC', 'JADES', 'KAYAK', 'LOTUS', 'LYCÉE', 'MAMBO',
    'NAVET', 'OASIS', 'OPALE', 'PIQUE', 'QUAIS', 'QUOTA', 'RAYON', 'RHUME', 'SAUNA', 'SIROP',
    'TABAC', 'TANGO', 'WAGON', 'XÉNON', 'YOGAS', 'ZESTE', 'ZINCS',
  ],
}

/**
 * Uppercase and strip diacritics, so `épée` and `EPEE` are the same word. NFD
 * splits an accented letter into base + combining mark, and the replaced range is
 * exactly the combining-marks block — which is why this handles every accent
 * French uses without listing any of them.
 *
 * Lives here rather than in `wordle.ts` because it is a property of the word list
 * (these words are stored accented and compared folded), and `hangman.ts` needs
 * the same rule for the same reason.
 */
export function fold(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

/** Answers as they are spelled, accents included — this is what gets displayed. */
export function answersFor(locale: Locale): string[] {
  return ANSWERS[locale]
}

/** Everything a guess may be — the answer pool plus the wider accepted set —
 *  **folded**, since a guess is typed on a keyboard nobody should have to find
 *  the accent key on. */
export function acceptedFor(locale: Locale): Set<string> {
  return new Set([...ANSWERS[locale], ...EXTRA_GUESSES[locale]].map(fold))
}
