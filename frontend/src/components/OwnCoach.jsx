// Olympus: setting up a coach of your own (lib/own-coach.js): a portrait (a god of Olympus, or a
// picture of your own), a name, how it talks, and the AI behind it: a provider, its address,
// your API key and the model. "Test" asks it for one line before you save; "Load models" lists
// what your key can use. Opened from the + in the coach chat and in the full-screen coach.
import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { PROVIDERS, providerOf, problemOf, saveOwnCoach, deleteOwnCoach, askOwnCoach, listModels } from '../lib/own-coach.js'
import { GOD_AVATARS, avatarUrl } from '../lib/god-avatars.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import '../own-coach.css'

// How the coach talks. The sentence goes into its instructions, in English like the rest of them.
const STYLES = [
  { id: 'motivating', label: () => t('Motivating'), text: 'Be warm, energetic and motivating, never preachy.' },
  { id: 'analytical', label: () => t('Analytical'), text: 'Be calm, precise and analytical: explain the reason behind each recommendation and give concrete numbers.' },
  { id: 'calm', label: () => t('Calm and gentle'), text: 'Be calm, patient and gentle; encourage small steps and celebrate consistency.' },
  { id: 'tough', label: () => t('Tough love'), text: 'Be direct and demanding like a strict but caring coach, short sentences, no excuses, always respectful.' },
]

// A picture of your own, cut to a square and made small enough to keep on the device.
function readPicture(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(r.error)
    r.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const side = Math.min(img.width, img.height), size = 192
        const c = document.createElement('canvas'); c.width = size; c.height = size
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
        resolve(c.toDataURL('image/jpeg', 0.86))
      }
      img.src = r.result
    }
    r.readAsDataURL(file)
  })
}

const PROBLEM = {
  name: () => t('Give your coach a name.'),
  url: () => t('Enter the provider address, starting with https:// (or http:// for your own computer).'),
  model: () => t('Enter the model to use, or load the list.'),
  key: () => t('Enter your API key.'),
}

function Editor({ initial, close, onSaved }) {
  const uid = useStore(s => s.user?.id)
  const [c, setC] = useState(() => initial || { name: '', avatar: 'god:apollo', style: STYLES[0].text, provider: 'openai', baseUrl: PROVIDERS[0].baseUrl, model: '', key: '' })
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState(null)
  const file = useRef(null)
  const p = providerOf(c.provider)
  const set = patch => { setC(v => ({ ...v, ...patch })); setNote(null) }
  const preset = STYLES.find(s => s.text === c.style)?.id || 'custom'

  const pickProvider = id => { const np = providerOf(id); set({ provider: id, baseUrl: np.baseUrl || c.baseUrl, model: '' }); setModels(null) }
  const onFile = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { set({ avatar: await readPicture(f) }) } catch { useUI.getState().toast(t('That picture could not be read.')) }
  }
  const load = async () => {
    setBusy('models'); setNote(null)
    try { const list = await listModels(c); setModels(list); if (!list.length) setNote({ bad: true, text: t('The provider listed no models. Type the model name.') }) }
    catch (e) { setNote({ bad: true, text: t('Could not load the models: {0}', e?.data?.message || e?.message || '') }) }
    finally { setBusy('') }
  }
  const test = async () => {
    const pr = problemOf(c)
    if (pr) { setNote({ bad: true, text: PROBLEM[pr]() }); return }
    setBusy('test'); setNote(null)
    try {
      const r = await askOwnCoach(c, [{ role: 'user', content: 'Introduce yourself in one short sentence.' }])
      setNote({ bad: false, text: r.reply.slice(0, 240) })
    } catch (e) { setNote({ bad: true, text: e?.data?.message || e?.message || t('No answer.') }) }
    finally { setBusy('') }
  }
  const save = () => {
    const pr = problemOf(c)
    if (pr) { setNote({ bad: true, text: PROBLEM[pr]() }); return }
    const saved = saveOwnCoach(uid, c)
    close()
    useUI.getState().toast(t('{0} is ready.', saved.name))
    onSaved?.(saved)
  }
  const remove = () => { deleteOwnCoach(uid, c.id); close(); useUI.getState().toast(t('{0} removed.', c.name)); onSaved?.(null) }

  const pic = avatarUrl(c.avatar)
  return <div className="oc">
    <h3 style={{ marginBottom: 4 }}>{initial ? t('Edit your coach') : t('Your own AI coach')}</h3>
    <p className="small muted" style={{ marginTop: 0 }}>{t('Bring your own AI model. The key stays on this device and goes only to the provider you choose; there is no daily limit.')}</p>

    <div className="oc-l">{t('Portrait')} <span className="muted">({t('optional')})</span></div>
    <div className="oc-avs">
      <button className={'oc-av oc-up' + (pic && !String(c.avatar).startsWith('god:') ? ' on' : '')} onClick={() => file.current?.click()} aria-label={t('Your picture')}>
        {pic && !String(c.avatar).startsWith('god:') ? <img src={pic} alt="" /> : <Icon name="camera" />}
      </button>
      {GOD_AVATARS.map(g => <button key={g.id} className={'oc-av' + (c.avatar === 'god:' + g.id ? ' on' : '')} onClick={() => set({ avatar: 'god:' + g.id })} aria-label={g.name} title={g.name}>
        <img src={g.url} alt="" />
      </button>)}
      <button className={'oc-av oc-none' + (!c.avatar ? ' on' : '')} onClick={() => set({ avatar: null })} aria-label={t('No portrait')}><Icon name="xmark" /></button>
      <input ref={file} type="file" accept="image/*" hidden onChange={onFile} />
    </div>

    <label className="oc-l" htmlFor="oc-name">{t('Name')} <span className="oc-req">*</span></label>
    <input id="oc-name" className="input" maxLength={30} value={c.name} placeholder={t('e.g. Apollo')} onChange={e => set({ name: e.target.value })} />

    <div className="oc-l">{t('How it talks')}</div>
    <div className="chips oc-wrap">
      {STYLES.map(s => <button key={s.id} className={'chip' + (preset === s.id ? ' on' : '')} onClick={() => set({ style: s.text })}>{s.label()}</button>)}
      <button className={'chip' + (preset === 'custom' ? ' on' : '')} onClick={() => set({ style: preset === 'custom' ? c.style : '' })}>{t('My own words')}</button>
    </div>
    {preset === 'custom' && <textarea className="input oc-style" rows={2} maxLength={300} value={c.style} placeholder={t('e.g. Talk like a Spartan trainer, short and to the point.')} onChange={e => set({ style: e.target.value })} />}

    <label className="oc-l" htmlFor="oc-prov">{t('AI provider')}</label>
    <select id="oc-prov" className="input" value={c.provider} onChange={e => pickProvider(e.target.value)}>
      {PROVIDERS.map(x => <option key={x.id} value={x.id}>{x.id === 'custom' ? t('Other (OpenAI-compatible)') : x.local ? x.name.replace(/\(.*\)/, '(' + t('your computer') + ')') : x.name}</option>)}
    </select>
    {p.local && <p className="small muted oc-hint">{t('Runs on your own computer, free. From the phone, use the computer\'s address on your Wi-Fi instead of localhost, for example http://192.168.1.20:11434/v1.')}</p>}

    <label className="oc-l" htmlFor="oc-url">{t('Address (base URL)')}</label>
    <input id="oc-url" className="input" inputMode="url" value={c.baseUrl} placeholder="https://…/v1" onChange={e => set({ baseUrl: e.target.value })} />

    <label className="oc-l" htmlFor="oc-key">{t('API key')} {p.key ? <span className="oc-req">*</span> : <span className="muted">({t('optional')})</span>}</label>
    <div className="oc-keyrow">
      <input id="oc-key" className="input" type={showKey ? 'text' : 'password'} autoComplete="off" value={c.key} placeholder={p.key ? 'sk-…' : ''} onChange={e => set({ key: e.target.value })} />
      <button className="iconbtn" onClick={() => setShowKey(v => !v)} aria-label={showKey ? t('Hide') : t('Show')}><Icon name={showKey ? 'lock' : 'key'} /></button>
    </div>
    {p.keyUrl && <p className="small muted oc-hint">{t('Get a key at {0}', p.keyUrl)}</p>}

    <label className="oc-l" htmlFor="oc-model">{t('Model')} <span className="oc-req">*</span></label>
    <div className="oc-keyrow">
      <input id="oc-model" className="input" value={c.model} placeholder={t('the model name')} onChange={e => set({ model: e.target.value })} />
      <Button size="sm" variant="tinted" disabled={!!busy} onClick={load}>{busy === 'models' ? t('Loading…') : t('Load models')}</Button>
    </div>
    {models?.length > 0 && <div className="chips oc-wrap oc-models">
      {models.slice(0, 60).map(m => <button key={m} className={'chip nocap' + (c.model === m ? ' on' : '')} onClick={() => set({ model: m })}>{m}</button>)}
    </div>}

    {note && <div className={'oc-note' + (note.bad ? ' bad' : ' good')} role="status">{!note.bad && <b>{c.name || t('Your coach')}: </b>}{note.text}</div>}

    <div className="oc-acts">
      <Button disabled={!!busy} onClick={test} icon="sparkles">{busy === 'test' ? t('Asking…') : t('Test')}</Button>
      <Button variant="primary" disabled={!!busy} onClick={save}>{t('Save')}</Button>
    </div>
    {initial && <Button variant="ghost" className="danger" onClick={remove} style={{ marginTop: 6 }}>{t('Remove this coach')}</Button>}
  </div>
}

/** Opens the editor for coach `initial` (or a new one); `onSaved(coach | null)` after saving or removing. */
export const ownCoachSheet = (initial = null, onSaved) => useUI.getState().openSheet(close => <Editor initial={initial} close={close} onSaved={onSaved} />)
