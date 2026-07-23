/** Category color palette — same ARGB values as Android CategoryColors.kt. */

/** Force Android-style signed 32-bit ints so shared Firestore docs match. */
function argb(hex: number): number {
  return hex | 0;
}

export const CATEGORY_COLOR_INTS: number[] = [
  argb(0xffd9a0a0),
  argb(0xff8fbfa9),
  argb(0xff7eb0e8),
  argb(0xffa99ae0),
  argb(0xffddb98a),
  argb(0xff7abfb4),
  argb(0xffc9a0b0),
  argb(0xffb8a888),
  argb(0xffb8a0a0),
  argb(0xff9aafc4),
  argb(0xff9b93c8),
  argb(0xff8ab5ac),
  argb(0xffc4b090),
  argb(0xff9b9ba8),
  argb(0xff6e6e78),
  argb(0xff48484e),
];

/** True when two stored colorInts are the same color (ignoring alpha-encoding differences). */
export function colorIntsMatch(a: number, b: number): boolean {
  return (a & 0xffffff) === (b & 0xffffff);
}
