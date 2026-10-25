// Olympus: the app's logo, as the welcome screens show it above the name.
import logo from '../assets/logo.png'

export default function Logo({ size = 104 }) {
  return <div style={{ display: 'flex', justifyContent: 'center' }}>
    <img src={logo} alt="" width={size} height={size} draggable={false}
      style={{ width: size, height: size, borderRadius: size * 0.22, objectFit: 'cover', boxShadow: '0 6px 22px rgba(0,0,0,.22)' }} />
  </div>
}
