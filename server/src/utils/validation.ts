const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function isValidIdentifier(name: string): boolean {
  return SAFE_IDENTIFIER.test(name) && name.length <= 128;
}

export function validateIdentifier(name: string, label: string): void {
  if (!isValidIdentifier(name)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
}

export function sanitizeForCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
