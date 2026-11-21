/** Arms-up child figure used in the hero and as the demo-mode stage stand-in. */
export function KidFigure({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 170" aria-hidden="true" focusable="false">
      <path
        d="M48 112L44 158M72 112l4 46"
        stroke="var(--kid-limb, var(--ink))"
        strokeWidth="13"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M44 62L16 18M76 62l28-44"
        stroke="var(--coral)"
        strokeWidth="13"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="38" y="50" width="44" height="70" rx="20" fill="var(--coral)" />
      <circle cx="60" cy="30" r="19" fill="var(--kid-limb, var(--ink))" />
    </svg>
  )
}
