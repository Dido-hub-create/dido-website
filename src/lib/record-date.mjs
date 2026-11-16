/** Date-only CMS values stay on the same calendar day in every time zone. */
export function recordDate(value) {
  if (typeof value !== 'string') return undefined;
  const iso = value.trim();
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== iso) return undefined;
  return {iso,label:`${iso.slice(8,10)}.${iso.slice(5,7)}.${iso.slice(0,4)}`};
}
