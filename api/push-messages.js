import { NUDGE_COPY } from './nudge-copy.js';
import { lineIndex } from './nudge.js';

const COPY = {
  en: {
    restTitle: 'Rest over 💪',
    restBody: 'Time for your next set.',
    testBody: 'Test notification ✅ This is what alerts look like.',
    dayFallbackTitle: 'Workout planned today',
    dayRoutineSuffix: 'today',
    dayBody: "It's on your plan. Let's go 💪",
  },
  'pt-BR': {
    restTitle: 'Descanso terminado 💪',
    restBody: 'Hora da próxima série.',
    testBody: 'Notificação de teste ✅ É assim que os alertas aparecem.',
    dayFallbackTitle: 'Treino planejado para hoje',
    dayRoutineSuffix: 'hoje',
    dayBody: 'Está no seu plano. Bora treinar 💪',
  },
};

const copyFor = lang => COPY[lang] || COPY.en;

export function restTimerPush(lang) {
  const copy = copyFor(lang);
  return { title: copy.restTitle, body: copy.restBody, tag: 'rest-timer' };
}

export function testPush(lang) {
  return { title: 'Olympus', body: copyFor(lang).testBody, tag: 'test' };
}

export function dayReminderPush(lang, routine) {
  const copy = copyFor(lang);
  return {
    title: routine
      ? `${routine.emoji || '🏋️'} ${routine.name} ${copy.dayRoutineSuffix}`
      : copy.dayFallbackTitle,
    body: copy.dayBody,
    tag: 'day-reminder',
  };
}

// The missed-workout nudge (nudge.js). Its copy is translated in the frontend packs and generated
// into nudge-copy.js, so every language the app speaks has it — unlike the strings above, which
// predate that and fall back to English. de-CH is de with ß written ss, as in the frontend
// (lib/i18n-core.js DERIVED_LOCALES).
const nudgeCopyFor = lang => {
  if (lang === 'de-CH') {
    const ch = s => s.replace(/ß/g, 'ss');
    return Object.fromEntries(Object.entries(NUDGE_COPY.de).map(([k, c]) => [k, { title: ch(c.title), lines: c.lines.map(ch) }]));
  }
  return NUDGE_COPY[lang] || NUDGE_COPY.en;
};
export function nudgePush(lang, tone, routine, iso) {
  const copy = nudgeCopyFor(lang)[NUDGE_COPY.en[tone] ? tone : 'friendly'];
  const line = copy.lines[lineIndex(iso, copy.lines.length)];
  const name = routine?.name || 'Olympus';
  return { title: copy.title, body: line.replace('{0}', () => name), tag: 'nudge' };
}

// Olympus social pushes: a like, a comment, a new follower, a follow request, an accepted
// request. `note` is { kind, fromName, text }; the language falls back to English.
const SOCIAL_COPY = {
  en: { like: '{0} liked your post', comment: '{0} commented: {1}', follow: '{0} started following you', request: '{0} wants to follow you', accepted: '{0} accepted your follow request' },
  it: { like: 'A {0} piace il tuo post', comment: '{0} ha commentato: {1}', follow: '{0} ha iniziato a seguirti', request: '{0} vuole seguirti', accepted: '{0} ha accettato la tua richiesta' },
  es: { like: 'A {0} le gusta tu publicación', comment: '{0} comentó: {1}', follow: '{0} empezó a seguirte', request: '{0} quiere seguirte', accepted: '{0} aceptó tu solicitud' },
  fr: { like: '{0} a aimé ta publication', comment: '{0} a commenté : {1}', follow: '{0} s’est abonné à toi', request: '{0} veut s’abonner à toi', accepted: '{0} a accepté ta demande' },
  de: { like: '{0} gefällt dein Beitrag', comment: '{0} hat kommentiert: {1}', follow: '{0} folgt dir jetzt', request: '{0} möchte dir folgen', accepted: '{0} hat deine Anfrage angenommen' },
  pt: { like: '{0} gostou da tua publicação', comment: '{0} comentou: {1}', follow: '{0} começou a seguir-te', request: '{0} quer seguir-te', accepted: '{0} aceitou o teu pedido' },
  'pt-BR': { like: '{0} curtiu sua publicação', comment: '{0} comentou: {1}', follow: '{0} começou a seguir você', request: '{0} quer seguir você', accepted: '{0} aceitou seu pedido' },
};

export function socialPush(lang, note) {
  const base = String(lang || 'en');
  const copy = SOCIAL_COPY[base] || SOCIAL_COPY[base.split('-')[0]] || SOCIAL_COPY.en;
  const line = (copy[note.kind] || SOCIAL_COPY.en[note.kind] || '{0}')
    .replace('{0}', note.fromName || 'Olympus').replace('{1}', note.text || '');
  // One tray entry per kind: a burst of likes replaces itself instead of stacking up.
  return { title: 'Olympus', body: line, tag: 'social-' + note.kind };
}
