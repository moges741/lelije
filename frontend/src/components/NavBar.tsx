import { NavLink } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { Icon, type IconName } from './Icon'

interface NavItem {
  to: string
  end?: boolean
  icon: IconName
  label: string
}

const LABELS = {
  en: {
    today: 'Today',
    bodyAi: 'Body AI',
    brain: 'Brain Games',
    story: 'Stories',
    overview: 'Overview',
    activity: 'Activity & AI',
    requests: 'Play Requests',
    family: 'Family & Kids',
  },
  am: {
    today: 'ዛሬ',
    bodyAi: 'የሰውነት AI',
    brain: 'የአእምሮ ጨዋታ',
    story: 'ታሪኮች',
    overview: 'ማጠቃለያ',
    activity: 'እንቅስቃሴ እና AI',
    requests: 'የጨዋታ ጥያቄ',
    family: 'ቤተሰብ እና ልጆች',
  },
  om: {
    today: 'Har’a',
    bodyAi: 'Tapha Qaamaa',
    brain: 'Tapha Sammuu',
    story: 'Seenaa',
    overview: 'Cuunfaa',
    activity: 'Sochii fi AI',
    requests: 'Gaaffii Taphaa',
    family: 'Maatii fi Ijoollee',
  },
} as const

export function AppNav({ role }: { role: 'child' | 'parent' }) {
  const { language } = useApp()
  const copy = LABELS[language] ?? LABELS.en

  const items: NavItem[] =
    role === 'child'
      ? [
          { to: '/missions', end: true, icon: 'star', label: copy.today },
          { to: '/activities', icon: 'camera', label: copy.bodyAi },
          { to: '/child/brain', icon: 'check', label: copy.brain },
          { to: '/child/story', icon: 'flame', label: copy.story },
        ]
      : [
          { to: '/parent', end: true, icon: 'family', label: copy.overview },
          { to: '/parent/activity', icon: 'star', label: copy.activity },
          { to: '/parent/play', icon: 'clock', label: copy.requests },
          { to: '/family', icon: 'child', label: copy.family },
        ]

  return (
    <nav className="app-nav" aria-label={role === 'child' ? 'Child navigation' : 'Parent navigation'}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => (isActive ? 'app-nav-link is-active' : 'app-nav-link')}
        >
          <Icon name={item.icon} size={17} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
