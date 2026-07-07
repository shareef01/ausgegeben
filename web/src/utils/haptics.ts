/** Light tap feedback — mirrors Android rememberAppHaptics().light(). */
export function hapticLight(): void {
  try {
    navigator.vibrate?.(8);
  } catch {
    // unsupported or blocked
  }
}

/** Medium tap — FAB, primary CTAs. */
export function hapticMedium(): void {
  try {
    navigator.vibrate?.(14);
  } catch {
    // unsupported or blocked
  }
}

/** Success feedback — save, confirm, etc. */
export function hapticSuccess(): void {
  try {
    navigator.vibrate?.([12, 40, 12]);
  } catch {
    // unsupported or blocked
  }
}
