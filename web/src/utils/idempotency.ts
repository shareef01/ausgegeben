/**
 * Stable Firestore document identity for an idempotent expense creation.
 * Both clients hash the exact UTF-8 bytes and encode lowercase hexadecimal.
 */
export async function expenseDocumentId(idempotencyKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(idempotencyKey);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
