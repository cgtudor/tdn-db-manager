// Express 5 route params can be string | string[]. This helper extracts a single string.
export function p(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0];
  return value || '';
}
