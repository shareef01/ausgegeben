import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Trap Tab focus inside a dialog and optionally handle Escape. Restores prior focus on unmount. */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onEscape?: () => void,
  restoreFocus = true,
) {
  // Held in a ref, deliberately: callers build onEscape from state that changes as
  // the user types (Add transaction derives it from the unsaved-changes check). With
  // it in the dependency array the effect re-ran mid-edit and its body moved focus to
  // the first focusable element — the close button — so the amount field lost focus
  // after a single keystroke and the phone keyboard dropped with it.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    const root = containerRef.current;
    if (!root) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const getFocusable = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        // tabIndex < 0: a button the page took out of the Tab order (the unchecked
        // options of a Settings radio group, AUS-303) still matches `button`, and
        // counting it here would make Tab wrap from it instead of from the real last stop.
        (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0 &&
          !el.closest('[inert], [aria-hidden="true"]') && el.getClientRects().length > 0,
      );

    const focusable = getFocusable();
    (focusable[0] ?? root).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!root.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (restoreFocus) previouslyFocused?.focus();
    };
  }, [active, containerRef, restoreFocus]);
}
