type Point = [number, number]

interface KidSpec {
  /** Where the feet touch the ground in the scene. */
  x: number
  y: number
  /** Roughly age: 0.7 is a 5-year-old, 1 is a 13-year-old. */
  scale: number
  skin: string
  hair: string
  hairStyle: 'short' | 'bun' | 'curly' | 'puffs'
  shirt: string
  pants: string
  /** Hand and foot positions, in a local space where the feet stand at y = 0. */
  hands: [Point, Point]
  feet: [Point, Point]
  /** How far the child is off the ground. */
  lift?: number
  delay: string
}

const KIDS: KidSpec[] = [
  {
    // Star jump
    x: 165,
    y: 352,
    scale: 0.98,
    skin: '#8d5524',
    hair: '#1b1b2f',
    hairStyle: 'puffs',
    shirt: '#ff6a4d',
    pants: '#114595',
    hands: [
      [-52, -170],
      [52, -170],
    ],
    feet: [
      [-27, 0],
      [27, 0],
    ],
    lift: 14,
    delay: '0s',
  },
  {
    // Jumping with bent knees
    x: 300,
    y: 362,
    scale: 0.78,
    skin: '#c68642',
    hair: '#1b1b2f',
    hairStyle: 'short',
    shirt: '#ffcf3f',
    pants: '#2a74d0',
    hands: [
      [-44, -146],
      [44, -146],
    ],
    feet: [
      [-20, -12],
      [18, -22],
    ],
    lift: 26,
    delay: '0.5s',
  },
  {
    // Arms straight up
    x: 435,
    y: 354,
    scale: 0.9,
    skin: '#e0ac69',
    hair: '#5a3a22',
    hairStyle: 'curly',
    shirt: '#2a74d0',
    pants: '#10284b',
    hands: [
      [-16, -178],
      [16, -178],
    ],
    feet: [
      [-10, 0],
      [10, 0],
    ],
    lift: 6,
    delay: '0.25s',
  },
  {
    // One arm up, one leg kicked
    x: 565,
    y: 364,
    scale: 0.7,
    skin: '#a0693a',
    hair: '#2b1a10',
    hairStyle: 'bun',
    shirt: '#46b562',
    pants: '#ff6a4d',
    hands: [
      [-44, -118],
      [30, -162],
    ],
    feet: [
      [-8, 0],
      [34, -18],
    ],
    lift: 8,
    delay: '0.75s',
  },
]

const SHOULDERS: [Point, Point] = [
  [-14, -108],
  [14, -108],
]
const HIPS: [Point, Point] = [
  [-8, -68],
  [8, -68],
]

function line(from: Point, to: Point) {
  return `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`
}

function along(from: Point, to: Point, t: number): Point {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
}

function Hair({ style, color }: { style: KidSpec['hairStyle']; color: string }) {
  return (
    <g fill={color}>
      <path d="M-19.5 -138a19.5 19.5 0 0 1 39 0q-19.5-9-39 0z" />
      {style === 'bun' && <circle cx="0" cy="-162" r="8" />}
      {style === 'puffs' && (
        <>
          <circle cx="-20" cy="-148" r="9" />
          <circle cx="20" cy="-148" r="9" />
        </>
      )}
      {style === 'curly' && (
        <>
          <circle cx="-14" cy="-150" r="8" />
          <circle cx="-5" cy="-156" r="8" />
          <circle cx="6" cy="-156" r="8" />
          <circle cx="15" cy="-150" r="8" />
        </>
      )}
    </g>
  )
}

function Kid({ kid }: { kid: KidSpec }) {
  const lift = kid.lift ?? 0
  return (
    <g>
      <ellipse
        cx={kid.x}
        cy={kid.y + 3}
        rx={28 * kid.scale}
        ry={6 * kid.scale}
        fill="rgb(16 40 75 / 0.18)"
      />
      <g transform={`translate(${kid.x} ${kid.y - lift}) scale(${kid.scale})`}>
        <g className="art-kid-bob" style={{ animationDelay: kid.delay }}>
          {kid.feet.map((foot, index) => (
            <g key={`leg-${index}`}>
              <path
                d={line(HIPS[index], foot)}
                stroke={kid.pants}
                strokeWidth="13"
                strokeLinecap="round"
              />
              <ellipse cx={foot[0] + (index === 0 ? -4 : 4)} cy={foot[1] + 2} rx="10" ry="5.5" fill="#fff" />
            </g>
          ))}
          {kid.hands.map((hand, index) => {
            const shoulder = SHOULDERS[index]
            const sleeve = along(shoulder, hand, 0.4)
            return (
              <g key={`arm-${index}`}>
                <path d={line(shoulder, hand)} stroke={kid.skin} strokeWidth="9" strokeLinecap="round" />
                <path d={line(shoulder, sleeve)} stroke={kid.shirt} strokeWidth="12" strokeLinecap="round" />
                <circle cx={hand[0]} cy={hand[1]} r="6" fill={kid.skin} />
              </g>
            )
          })}
          <rect x="-17" y="-116" width="34" height="52" rx="14" fill={kid.shirt} />
          <rect x="-17" y="-74" width="34" height="14" rx="6" fill={kid.pants} />
          <circle cx="0" cy="-138" r="19" fill={kid.skin} />
          <Hair style={kid.hairStyle} color={kid.hair} />
          <circle cx="-6.5" cy="-137" r="2.3" fill="#10284b" />
          <circle cx="6.5" cy="-137" r="2.3" fill="#10284b" />
          <path d="M-6.5 -130q6.5 7 13 0" stroke="#10284b" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </g>
      </g>
    </g>
  )
}

const STAR = 'M0-12l3.5 7.6 8.3 1-6.1 5.7 1.6 8.2L0 5.4-7.3 9.5l1.6-8.2-6.1-5.7 8.3-1z'

/** Four children of different ages moving together. Decorative; the page names it with an aria-label. */
export function KidsScene({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 720 400" role="img" aria-label={label} focusable="false">
      <ellipse cx="360" cy="372" rx="352" ry="30" fill="#23824a" />
      <ellipse cx="360" cy="366" rx="340" ry="26" fill="#46b562" />
      {[
        [70, 120, 1],
        [250, 60, 0.7],
        [380, 90, 1.1],
        [520, 50, 0.8],
        [650, 130, 1],
      ].map(([x, y, s]) => (
        <path key={`${x}-${y}`} d={STAR} transform={`translate(${x} ${y}) scale(${s})`} fill="#ffcf3f" />
      ))}
      {KIDS.map((kid) => (
        <Kid key={kid.x} kid={kid} />
      ))}
    </svg>
  )
}
