// Runtime-agnostic core of the i18n module: state, constants and readers (t, dateLocale,
// instrFor, exerciseNameFor, getLang). Plain Node-loadable — the browser-only pieces
// (import.meta.glob lazy
// loads, the React subscription hook) live in i18n.js and re-export from here.

export const LANGS = {
  en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français', it: 'Italiano',
  pt: 'Português (Portugal)', 'pt-BR': 'Português (Brasil)', pl: 'Polski',
  tr: 'Türkçe', ru: 'Русский', zh: '中文',
  ko: '한국어', hi: 'हिन्दी', th: 'ไทย', hu: 'Magyar'
}
export const INSTR_LANGS = ['en', 'es', 'fr', 'it', 'tr', 'ru', 'zh', 'hi', 'pl', 'ko', 'pt-BR', 'hu']
export const EXERCISE_NAME_LANGS = ['pt-BR', 'hu']
export const DATE_LOCALES = {
  en: 'en-GB', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', pt: 'pt-PT', 'pt-BR': 'pt-BR',
  pl: 'pl-PL', tr: 'tr-TR', ru: 'ru-RU', zh: 'zh-CN', ko: 'ko-KR', hi: 'hi-IN', th: 'th-TH', hu: 'hu-HU'
}

let lang = 'en'                 // set only by _setLangState, called from i18n.js setLang
let dict = {}                   // current locale pack (empty = English fallback)
let instr = null                // { exId: [steps] } for the current language, null = English
let exerciseNames = null        // { exId: translated name }, null = original catalogue name
let version = 0                 // bumped on every setLang; drives the React subscription selector

export const getLang = () => lang
export const dateLocale = () => DATE_LOCALES[lang] || 'en-GB'
export const getVersion = () => version

// Translate a source string; {0},{1}… are replaced with args (also on the English fallback).
export function t(s, ...args) {
  let v = dict[s] || s
  for (let i = 0; i < args.length; i++) v = v.replaceAll('{' + i + '}', args[i])
  return v
}

// Instructions for an exercise in the current language (English steps as fallback).
export const instrFor = ex => (instr && instr[ex.id]) || ex.st || []

// Built-in catalogue names are bilingual when a complete translated name pack is active.
// User-created exercises have no entry in the pack and keep their exact chosen name.
export const exerciseNameFor = ex => {
  const translated = exerciseNames && ex && exerciseNames[ex.id]
  if (!translated) return ex?.n || ''
  // Some names (Burpee, Pilates, brand/model terms) are the established term in the target
  // language too. Repeating an identical loanword in parentheses adds noise rather than
  // context. Compared in the active language's own casing rules, not hardcoded to one —
  // this only ever differs from ordinary casing for languages with locale-specific rules
  // (e.g. Turkish dotless i), which does not include any language shipped here today.
  return translated.toLocaleLowerCase(lang) === ex.n.toLocaleLowerCase('en')
    ? translated
    : `${translated} (${ex.n})`
}

// Brazilian gym slang the curated catalogue names never use. Each rule appends its synonyms
// to an exercise's SEARCH text only — the displayed name never changes. Measured against the
// 1,324-exercise catalogue: every left-hand term returned zero or misleading results before
// this (e.g. "peso morto" matched only "inseto morto", the dead bug).
// ponytail: a flat list beats a synonym engine; add a row when a search comes up empty.
const PT_BR_SEARCH_ALIASES = [
  [/\bcabos?\b/iu, 'polia polias'],
  [/levantamento terra/iu, 'peso morto'],
  [/abdução de quadril/iu, 'cadeira abdutora'],
  [/adução de quadril/iu, 'cadeira adutora'],
  [/crucifixo[^,]*m[áa]quina/iu, 'voador peck deck'],
  [/puxada/iu, 'puxador'],
  [/(?:barra fixa|puxada)[^,]*assistid/iu, 'graviton'],
  [/agachamento[^,]*barra/iu, 'agachamento livre'],
  [/supino[^,]*barra/iu, 'supino reto'],
  [/panturrilha/iu, 'gêmeos'],
  [/remada curvada unilateral com halter/iu, 'serrote'],
]

// Search both the localized and canonical English title without changing persisted data.
// In pt-BR the searchable text also carries the slang above, so "peso morto" and
// "levantamento terra" reach the same exercise.
export const exerciseNameSearchText = ex => {
  const translated = exerciseNames && ex && exerciseNames[ex.id]
  if (!translated) return ex?.n || ''
  const base = `${translated} ${ex.n}`
  if (lang !== 'pt-BR') return base
  const extra = PT_BR_SEARCH_ALIASES.filter(([re]) => re.test(base)).map(([, slang]) => slang)
  return extra.length ? `${base} ${extra.join(' ')}` : base
}

// Called by i18n.js's setLang once the locale pack has been loaded — kept here rather than
// exported as setLang because loading packs requires import.meta.glob, which is Vite-only.
// `dict`, `instr` and `exerciseNames` may be null to reset to their English fallbacks.
export function _setLangState(newLang, newDict, newInstr, newExerciseNames) {
  lang = LANGS[newLang] ? newLang : 'en'
  dict = lang === 'en' ? {} : (newDict || {})
  instr = lang === 'en' || !INSTR_LANGS.includes(lang) ? null : (newInstr || null)
  exerciseNames = lang === 'en' || !EXERCISE_NAME_LANGS.includes(lang) ? null : (newExerciseNames || null)
  version++
  return version
}
