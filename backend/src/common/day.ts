const ADDIS_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Addis_Ababa',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Africa/Addis_Ababa calendar date as "YYYY-MM-DD". */
export function addisDay(date: Date = new Date()): string {
  return ADDIS_DATE.format(date);
}

/** The calendar date before a "YYYY-MM-DD" day. */
export function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** The calendar date `count` days before a "YYYY-MM-DD" day. */
export function daysAgo(day: string, count: number): string {
  let current = day;
  for (let i = 0; i < count; i++) current = previousDay(current);
  return current;
}

/**
 * Consecutive active days ending today. A day with nothing yet today does not
 * break the streak, so it still shows in the morning: counting then starts yesterday.
 */
export function countStreak(activeDays: Set<string>, today: string): number {
  let day = activeDays.has(today) ? today : previousDay(today);
  let streak = 0;
  while (activeDays.has(day)) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}
