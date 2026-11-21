import type { IconName } from '../components/Icon'
import type { Mission } from '../types/mission'

/** One small picture per mission, chosen from what the mission asks for. */
export function missionIcon(mission: Mission): IconName {
  if (mission.goal) return mission.goal.detector === 'jump' ? 'jump' : 'arms'
  if (mission.type === 'helper') return 'hand'
  if (mission.type === 'physical') return 'flame'
  return 'star'
}
