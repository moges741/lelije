import { addisDay } from '../common/day';
import { Mission, MissionsInput, MissionsResult } from './missions.types';

// Stand-in for `generateMissions` from ai/missions/index.js until the AI
// owner's module is on main. Same input and output shape, English text only.

const POOL: Omit<Mission, 'id'>[] = [
  {
    title: 'Star Jumps',
    description:
      'Jump 10 times like you are reaching for the stars. Stay in a clear space.',
    type: 'physical',
    durationMin: 3,
    points: 15,
    verification: 'pose',
    goal: { detector: 'jump', count: 10 },
    language: 'en',
    ageMin: 5,
    ageMax: 12,
    tags: ['indoor', 'energy'],
  },
  {
    title: 'Touch the Sky',
    description: 'Lift both arms high above your head 8 times.',
    type: 'physical',
    durationMin: 2,
    points: 10,
    verification: 'pose',
    goal: { detector: 'armsUp', count: 8 },
    language: 'en',
    ageMin: 5,
    ageMax: 12,
    tags: ['indoor', 'stretch'],
  },
  {
    title: 'Bunny Hops',
    description: 'Hop 6 times like a happy bunny on a soft floor.',
    type: 'game',
    durationMin: 2,
    points: 10,
    verification: 'pose',
    goal: { detector: 'jump', count: 6 },
    language: 'en',
    ageMin: 5,
    ageMax: 12,
    tags: ['indoor', 'fun'],
  },
  {
    title: 'Animal Walk',
    description: 'Walk like a bear, then like a crab, across the room.',
    type: 'game',
    durationMin: 4,
    points: 13,
    verification: 'self',
    language: 'en',
    ageMin: 5,
    ageMax: 12,
    tags: ['indoor', 'fun'],
  },
  {
    title: 'Tidy Helper',
    description: 'Put five things back where they belong.',
    type: 'helper',
    durationMin: 5,
    points: 15,
    verification: 'self',
    language: 'en',
    ageMin: 5,
    ageMax: 12,
    tags: ['indoor', 'helper'],
  },
  {
    title: 'Dance Party',
    description: 'Dance to your favourite song until it ends.',
    type: 'creative',
    durationMin: 3,
    points: 11,
    verification: 'self',
    language: 'en',
    ageMin: 5,
    ageMax: 12,
    tags: ['indoor', 'music'],
  },
];

export async function generateMissions(
  input: MissionsInput,
): Promise<MissionsResult> {
  const pose = POOL.filter((mission) => mission.verification === 'pose');
  const self = POOL.filter((mission) => mission.verification === 'self');
  // With a camera: two camera missions, then a tap-to-confirm one, so a parent still has something to approve.
  const ordered = input.cameraAvailable
    ? [...pose.slice(0, 2), ...self, ...pose.slice(2)]
    : [...self, ...pose];

  const datePart = addisDay().replaceAll('-', '');
  const missions = ordered
    .slice(0, input.count)
    .map((mission, index) => ({ ...mission, id: `m_${datePart}_${index}` }));

  return { missions, source: 'fallback', warnings: ['stub_generator'] };
}
