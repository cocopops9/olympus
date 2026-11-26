// A strip of running Greek key, as wide as its box, drawn in currentColor. Each strip needs its
// own pattern id: two strips on one page sharing an id would both point at the first one, and
// that one disappears with it when its sheet closes.
export default function Meander({ id, className = '' }) {
  return <svg className={className} aria-hidden="true" width="100%" height="8">
    <defs>
      <pattern id={id} width="12" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 7.5H9.5V.5H3V5H6.5V3" fill="none" stroke="currentColor" strokeWidth="1.1" />
      </pattern>
    </defs>
    <rect width="100%" height="8" fill={`url(#${id})`} />
  </svg>
}
