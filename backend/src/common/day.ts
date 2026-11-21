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
