const ICONS = {
  back: <path d="M15 5l-7 7 7 7" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  camera: (
    <>
      <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" />
      <circle cx="12" cy="13.2" r="3.4" />
    </>
  ),
  hand: (
    <path d="M9 11.5V5.2a1.6 1.6 0 013.2 0V10m0 0V8.4a1.6 1.6 0 013.2 0V11m0-.6a1.6 1.6 0 013.2 0V15a6 6 0 01-6 6h-.8a6 6 0 01-5-2.7l-2.2-3.5a1.6 1.6 0 012.6-1.8L9 15" />
  ),
  star: (
    <path d="M12 2.8l2.7 5.7 6.2.8-4.5 4.3 1.1 6.1L12 16.7l-5.5 3 1.1-6.1-4.5-4.3 6.2-.8z" />
  ),
  flame: (
    <path d="M12 3c.8 3.2 4.5 4.8 4.5 9.2a4.5 4.5 0 01-9 0c0-1.6.6-2.8 1.6-3.8.4 1.2 1 1.9 1.8 2.2C10.5 8.4 11 6 12 3z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  shield: <path d="M12 3l7 2.8v5.4c0 4.4-2.9 7.8-7 9.8-4.1-2-7-5.4-7-9.8V5.8z" />,
  play: <path d="M8 4.8v14.4a.8.8 0 001.2.7l11-7.2a.8.8 0 000-1.4l-11-7.2A.8.8 0 008 4.8z" />,
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0112 0v5l1.5 2H4.5z" />
      <path d="M10 19a2 2 0 004 0" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
      <circle cx="16" cy="7" r="2.6" />
      <circle cx="8" cy="17" r="2.6" />
    </>
  ),
  jump: <path d="M12 18V5.5M6.5 11L12 5.5 17.5 11M5 21h14" />,
  arms: (
    <>
      <circle cx="12" cy="6.2" r="2.2" />
      <path d="M5 3.5l4.6 7.2h4.8L19 3.5M9.6 10.7V20.5M14.4 10.7V20.5" />
    </>
  ),
} as const

export type IconName = keyof typeof ICONS

const FILLED: ReadonlySet<IconName> = new Set<IconName>(['star', 'play'])

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  const filled = FILLED.has(name)
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  )
}
