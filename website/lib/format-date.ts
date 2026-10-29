// website/lib/format-date.ts

const formatter = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' });

/** Render an ISO `YYYY-MM-DD` date as "29 October 2026", independent of the server's zone. */
export function formatDate(isoDate: string): string {
  return formatter.format(new Date(`${isoDate}T00:00:00Z`));
}
