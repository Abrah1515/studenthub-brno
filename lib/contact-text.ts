// A valid ISO calendar date is not a phone number. Keep adjacent extra digits
// intact so that date-shaped prefixes cannot conceal a real contact number.
export function withoutIsoDates(value: string) {
  return value.replace(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})(?![\s.-]?\d)/g, (whole, year, month, day) => {
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day) ? ' datum ' : whole;
  });
}
