const ADDIS_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Addis_Ababa',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Africa/Addis_Ababa calendar date as "YYYY-MM-DD". */
export function addisDay(date: Date = new Date()): string {
  return ADDIS_DATE.format(date);
}
