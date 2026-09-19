import { afterEach, describe, expect, test } from 'vitest'
import ptBR from '../exercise-names/pt-BR.js'
import { EXDB } from './exercises-data.js'
import { _setLangState, exerciseNameSearchText } from './i18n-core.js'

// Mirrors the picker's matcher: accent-stripped, lowercased, every typed word must appear.
const fold = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const hits = query => {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return EXDB.filter(ex => {
    const haystack = fold(exerciseNameSearchText(ex))
    return words.every(w => haystack.includes(w))
  })
}

describe('Brazilian gym slang reaches the catalogue', () => {
  afterEach(() => _setLangState('en', {}, null, null))

  // Each pair is "what a Brazilian lifter types" -> "a word from the canonical name it must reach".
  const pairs = [
    ['peso morto', 'levantamento terra'],
    ['crucifixo polia', 'cabo'],
    ['cadeira abdutora', 'abdução'],
    ['cadeira adutora', 'adução'],
    ['voador', 'crucifixo'],
    ['peck deck', 'crucifixo'],
    ['puxador', 'puxada'],
    ['agachamento livre', 'agachamento'],
    ['supino reto', 'supino'],
    ['gêmeos', 'panturrilha'],
    ['serrote', 'remada'],
    // 'cadeira flexora' e 'cadeira extensora' já são os nomes do catálogo — não precisam de apelido.
  ]

  test('every slang term finds an exercise whose real name matches', () => {
    _setLangState('pt-BR', {}, null, ptBR)
    for (const [slang, canonical] of pairs) {
      const found = hits(slang)
      expect(found.length, slang).toBeGreaterThan(0)
      expect(found.some(ex => fold(ptBR[ex.id]).includes(fold(canonical))), `${slang} -> ${canonical}`).toBe(true)
    }
  })

  test('the displayed name never carries the slang', () => {
    _setLangState('pt-BR', {}, null, ptBR)
    const terra = EXDB.find(ex => /levantamento terra/i.test(ptBR[ex.id] || ''))
    expect(exerciseNameSearchText(terra)).toMatch(/peso morto/)
    expect(ptBR[terra.id]).not.toMatch(/peso morto/)
  })

  test('other languages keep the plain search text', () => {
    _setLangState('en', {}, null, null)
    const any = EXDB[0]
    expect(exerciseNameSearchText(any)).toBe(any.n)
  })
})
