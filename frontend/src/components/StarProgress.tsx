import { Icon } from './Icon'

export function StarProgress({ count, goal }: { count: number; goal: number }) {
  return (
    <div
      className="star-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(count, goal)}
    >
      {Array.from({ length: goal }, (_, i) => (
        <span key={i} className={i < count ? 'is-lit' : undefined}>
          <Icon name="star" size={goal > 12 ? 22 : 30} />
        </span>
      ))}
    </div>
  )
}
