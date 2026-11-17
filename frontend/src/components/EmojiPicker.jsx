// Olympus: the emoji panel of a conversation (views/Chats.jsx). A few groups of the ones people
// actually send, a tab for each; tapping one hands it to `onPick`, and the panel stays open so
// several can be added in a row.
import { useState } from 'react'
import { t } from '../lib/i18n.js'

export const EMOJI_GROUPS = [
  { tab: '😀', list: '😀 😃 😄 😁 😆 😅 😂 🤣 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😜 🤪 😎 🤓 🥳 😏 😌 😴 🤔 🫡 🤗 😬 🙄 😮 😢 😭 😤 😡 🥶 🥵 🤯 😱 😷' },
  { tab: '👍', list: '👍 👎 👏 🙌 🙏 💪 🤝 👊 ✊ ✌️ 🤞 👌 🤙 👋 🫶 ☝️ 👀 🧠 🦾 🦵 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 🔥 ⭐ ✨ ⚡ 🎉 🏆 🥇 🥈 🥉 🎯 ✅ ❌' },
  { tab: '🏋️', list: '🏋️ 🏋️‍♀️ 🤸 🏃 🏃‍♀️ 🚴 🏊 🧘 🤾 🥊 🥋 ⚽ 🏀 🎾 🏐 🏈 ⛹️ 🧗 🚶 🤼 🍎 🍌 🥑 🥩 🍗 🥚 🥗 🍚 🍝 🍕 🍔 🍫 ☕ 💧 🥤 🍺 😋 🛌 ⏱️ 📈' },
  { tab: '🐶', list: '🐶 🐱 🦁 🐯 🐻 🐼 🦊 🐵 🐴 🦄 🐺 🐗 🐂 🦅 🦉 🐢 🐍 🦈 🐬 🌞 🌙 ⛰️ 🌊 🌲 🌸 🌍 ☀️ 🌈 ⛈️ ❄️ 🚗 ✈️ 🏠 🎵 🎧 📸 🎮 📚 💡 🎁' },
].map(g => ({ ...g, items: g.list.split(' ') }))

export default function EmojiPicker({ onPick }) {
  const [tab, setTab] = useState(0)
  return <div className="emoji-panel" role="group" aria-label={t('Emoji')}>
    <div className="emoji-tabs">
      {EMOJI_GROUPS.map((g, i) => <button key={g.tab} type="button" className={i === tab ? 'on' : ''} aria-pressed={i === tab} onClick={() => setTab(i)}>{g.tab}</button>)}
    </div>
    <div className="emoji-grid">
      {EMOJI_GROUPS[tab].items.map(e => <button key={e} type="button" onClick={() => onPick(e)}>{e}</button>)}
    </div>
  </div>
}
