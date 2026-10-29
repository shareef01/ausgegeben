import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/i18n';
import { IconDelete, IconEdit, IconLayers, IconMore } from '@/components/Icons';
import { isListboxNavigationKey, nextListboxIndex } from '@/utils/listbox';
import { applyCss } from '@/utils/cssVars';

interface ActionRowProps {
  children: ReactNode;
  /** Primary action: activating the row itself (click, tap, Enter/Space). */
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Spoken name of the row, e.g. "Groceries expense of −€62.40". */
  ariaLabel: string;
}

const TAP_SLOP = 8;
const LONG_PRESS_MS = 500;
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

/**
 * A list row whose own surface opens it for editing, with every other action behind a
 * visible "more" button.
 *
 * Replaces the old SwipeableRow, which never swiped: on touch only delete had a button and
 * duplicating was reachable solely through an undiscoverable long press. Long press (and
 * right-click / the context-menu key) now just opens the same menu the button does, so no
 * action depends on a hidden gesture. Activation uses `click`, which the browser already
 * withholds after a scroll, so flicking through the list cannot open a transaction.
 */
export function ActionRow({ children, onEdit, onDuplicate, onDelete, ariaLabel }: ActionRowProps) {
  const { t } = useTranslation();
  // 'keyboard' puts focus on the first item; a touch or mouse open focuses the menu itself,
  // so no item shows a focus ring the user did not ask for.
  const [menuOpen, setMenuOpen] = useState<false | 'keyboard' | 'pointer'>(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const suppressClick = useRef(false);

  const cancelPress = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }, []);

  useEffect(() => cancelPress, [cancelPress]);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false);
    if (restoreFocus) moreRef.current?.focus({ preventScroll: true });
  }, []);

  // Deleting removes this row, so focus would fall to <body> and a keyboard or screen-reader
  // user would lose their place. Hand it to the next row first (or the previous one at the
  // end of the list).
  const deleteAndRefocus = useCallback(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('.action-row__content')];
    const own = moreRef.current?.closest('.action-row')?.querySelector<HTMLElement>('.action-row__content');
    const index = own ? rows.indexOf(own) : -1;
    const neighbour = index >= 0 ? rows[index + 1] ?? rows[index - 1] : undefined;
    neighbour?.focus();
    onDelete();
  }, [onDelete]);

  const onPointerDown = (e: ReactPointerEvent) => {
    // A long press that ended without a click (Android fires contextmenu instead) must not
    // swallow the next genuine tap.
    suppressClick.current = false;
    // Mouse users have right-click; this is for touch and pen, where iOS Safari fires no
    // contextmenu event on long press.
    if (e.pointerType === 'mouse' || e.button !== 0) return;
    cancelPress();
    press.current = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        press.current = null;
        suppressClick.current = true;
        setMenuOpen('pointer');
      }, LONG_PRESS_MS),
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (p && (Math.abs(e.clientX - p.x) > TAP_SLOP || Math.abs(e.clientY - p.y) > TAP_SLOP)) cancelPress();
  };

  const onContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    cancelPress();
    setMenuOpen('pointer');
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onEdit();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEdit();
    } else if (e.key === 'Delete') {
      // Undo-able (the delete toast offers Undo), so a direct shortcut is safe.
      e.preventDefault();
      deleteAndRefocus();
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      setMenuOpen('keyboard');
    }
  };

  return (
    <div className="action-row">
      <div
        className="action-row__content"
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={onContextMenu}
      >
        {children}
      </div>
      <button
        ref={moreRef}
        type="button"
        className={`action-row__more${menuOpen ? ' action-row__more--open' : ''}`}
        aria-label={t('recordRowActionsFor', { row: ariaLabel })}
        aria-haspopup="menu"
        aria-expanded={menuOpen !== false}
        // detail is 0 for a click synthesised from Enter/Space.
        onClick={(e) => (menuOpen ? closeMenu(false) : setMenuOpen(e.detail === 0 ? 'keyboard' : 'pointer'))}
      >
        <IconMore width={18} height={18} aria-hidden />
      </button>
      {menuOpen ? (
        <ActionRowMenu
          anchorRef={moreRef}
          focusFirstItem={menuOpen === 'keyboard'}
          onClose={closeMenu}
          items={[
            { key: 'edit', label: t('editOrTap'), icon: <IconEdit width={16} height={16} aria-hidden />, run: onEdit },
            { key: 'duplicate', label: t('recordDuplicate'), icon: <IconLayers width={16} height={16} aria-hidden />, run: onDuplicate },
            { key: 'delete', label: t('recordSwipeDelete'), icon: <IconDelete width={16} height={16} aria-hidden />, run: deleteAndRefocus, danger: true },
          ]}
        />
      ) : null}
    </div>
  );
}

interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  run: () => void;
  danger?: boolean;
}

/** WAI-ARIA menu button popup, portalled so the row's overflow and the list's stacking never clip it. */
function ActionRowMenu({
  anchorRef,
  focusFirstItem,
  items,
  onClose,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  focusFirstItem: boolean;
  items: MenuItem[];
  onClose: (restoreFocus: boolean) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [active, setActive] = useState(focusFirstItem ? 0 : -1);
  const menuId = useId();

  // Place below the button, flip above when it would run past the viewport bottom (or the
  // fixed mobile nav), and keep it inside the horizontal gutters on a 320px screen.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const a = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const nav = document.querySelector('.bottom-nav-pill');
    const floor = Math.min(window.innerHeight, nav ? nav.getBoundingClientRect().top : Infinity) - VIEWPORT_MARGIN;
    let top = a.bottom + MENU_GAP;
    if (top + h > floor) top = Math.max(VIEWPORT_MARGIN, a.top - MENU_GAP - h);
    const left = Math.min(Math.max(VIEWPORT_MARGIN, a.right - w), window.innerWidth - w - VIEWPORT_MARGIN);
    applyCss(menu, { top: `${top}px`, left: `${left}px`, visibility: 'visible' });
    if (focusFirstItem) itemRefs.current[0]?.focus({ preventScroll: true });
    else menu.focus({ preventScroll: true });
    // Placement and initial focus happen once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorRef]);

  // Dismiss on outside press, and on scroll/resize, where a fixed popup would drift away from
  // its row.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose(false);
    };
    const onViewportChange = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      onClose(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [anchorRef, onClose]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
      return;
    }
    if (e.key === 'Tab') {
      // Hand focus back to the button and let Tab continue from there, rather than from the
      // end of <body> where the portal lives.
      onClose(true);
      return;
    }
    if (isListboxNavigationKey(e.key)) {
      const next = nextListboxIndex(e.key, active, items.length);
      if (next === null) return;
      e.preventDefault();
      setActive(next);
      itemRefs.current[next]?.focus({ preventScroll: true });
    }
  };

  return createPortal(
    <div ref={menuRef} id={menuId} className="action-row-menu card card--elevated" role="menu" tabIndex={-1} onKeyDown={onKeyDown}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {item.danger ? <div className="action-row-menu__separator" role="separator" /> : null}
          <button
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="menuitem"
            tabIndex={index === Math.max(active, 0) ? 0 : -1}
            className={`action-row-menu__item${item.danger ? ' action-row-menu__item--danger' : ''}`}
            onClick={() => {
              // Back on the button first, so the edit dialog's focus trap returns there on
              // close. Delete removes the row, so there is nothing to return to.
              onClose(!item.danger);
              item.run();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}
