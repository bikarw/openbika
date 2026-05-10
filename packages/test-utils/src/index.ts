export function createTestId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
