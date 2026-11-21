// Shapes from Contract B of the Build Contract (sections 6.2 and 6.3).

export interface Mission {
  id: string;
  title: string;
  description: string;
  type: 'physical' | 'game' | 'creative' | 'helper';
  durationMin: number;
  points: number;
  verification: 'pose' | 'self';
  goal?: { detector: 'jump' | 'armsUp'; count: number };
  language: string;
  ageMin: number;
  ageMax: number;
  tags: string[];
}

export interface MissionsInput {
  age: number;
  language: string;
  count: number;
  cameraAvailable: boolean;
  space: string;
  weather?: unknown;
  interests?: unknown;
  excludeIds: string[];
}

export interface MissionsResult {
  missions: Mission[];
  source: 'ai' | 'fallback' | 'mixed';
  warnings: string[];
}
