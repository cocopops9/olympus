import { describe, it, expect } from 'vitest'
import { textLang } from './text-lang.js'

describe('textLang', () => {
  it('finds Italian in an answer to a person whose app is in English', () => {
    expect(textLang('Oggi hai fatto un ottimo lavoro sulla panca: tre serie da otto ripetizioni con 80 kg. La prossima volta prova ad aggiungere 2,5 kg.', 'en')).toBe('it')
  })
  it('finds English in an answer to a person whose app is in Italian', () => {
    expect(textLang('Great work on the bench today. Next time add 2.5 kg and keep your reps clean.', 'it')).toBe('en')
  })
  it('tells Spanish, French, German and Portuguese apart', () => {
    expect(textLang('Hoy has hecho un buen trabajo, pero la próxima vez descansa más entre las series.', 'en')).toBe('es')
    expect(textLang('Tu as fait du bon travail aujourd\'hui, mais repose-toi plus entre les séries.', 'en')).toBe('fr')
    expect(textLang('Du hast heute gut trainiert, aber mach mehr Pause zwischen den Sätzen.', 'en')).toBe('de')
    expect(textLang('Você fez um bom treino hoje, mas descanse mais entre as séries.', 'en')).toBe('pt')
  })
  it('tells Russian from Ukrainian, and reads whole scripts', () => {
    expect(textLang('Отличная работа сегодня, отдохни подольше между подходами.', 'en')).toBe('ru')
    expect(textLang('Чудова робота сьогодні, відпочинь довше між підходами.', 'en')).toBe('uk')
    expect(textLang('오늘 정말 잘했어요. 다음에는 무게를 조금 올려 보세요.', 'en')).toBe('ko')
    expect(textLang('今天练得很好，下次可以加一点重量。', 'en')).toBe('zh')
  })
  it('keeps the app\'s language when the text says too little', () => {
    expect(textLang('OK', 'it')).toBe('it')
    expect(textLang('Bench press 3x8 @ 80 kg', 'it')).toBe('it')
    expect(textLang('', 'fr')).toBe('fr')
  })
  it('keeps the app\'s region when the text is in its language', () => {
    expect(textLang('Você fez um bom treino hoje, mas descanse mais entre as séries.', 'pt-BR')).toBe('pt-BR')
    expect(textLang('今天练得很好，下次可以加一点重量。', 'zh-TW')).toBe('zh-TW')
    expect(textLang('Oggi hai fatto un ottimo lavoro sulla panca.', 'it')).toBe('it')
  })
})
