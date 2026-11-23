import { create } from 'zustand';
import type { User } from 'firebase/auth';

/**
 * Immutable projection of the fields the UI actually reads.
 *
 * Storing the Firebase `User` itself was a bug: reload() mutates that object in
 * place and `auth.currentUser` keeps returning the same instance, so
 * `setUser(auth.currentUser)` re-published an identical reference. zustand
 * compares the selected slice with Object.is, so components selecting `s.user`
 * never re-rendered — after a user confirmed their email and hit Refresh, the
 * verify banner stayed up and App.tsx's seeding effect never re-ran, leaving a
 * freshly verified account with no categories until a full page reload.
 */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

interface AuthStore {
  user: AuthUser | null;
  ready: boolean;
  syncing: boolean;
  syncError: string | null;
  /**
   * A sign-out or account deletion is still wiping local data. Firebase reports the
   * signed-out user before that wipe finishes, so without this the sign-in form appeared
   * mid-cleanup: a second account signing in at that moment had its Firestore instance
   * terminated, its "keep me signed in" choice reset, and was then signed out again — in
   * every tab — when the first account's cleanup finished. App shows the loading screen
   * instead of the sign-in form while this is true.
   */
  endingSession: boolean;
  setUser: (user: User | null) => void;
  setReady: (ready: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setSyncError: (error: string | null) => void;
  setEndingSession: (ending: boolean) => void;
}

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
  };
}

/** Field-wise so a fresh snapshot with identical values does not re-render. */
function sameAuthUser(a: AuthUser | null, b: AuthUser | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.uid === b.uid &&
    a.email === b.email &&
    a.displayName === b.displayName &&
    a.emailVerified === b.emailVerified
  );
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  ready: false,
  syncing: false,
  syncError: null,
  endingSession: false,
  // Publishes a new snapshot only when something changed, so onAuthStateChanged
  // firing on every token refresh does not re-trigger user-keyed effects.
  setUser: (user) =>
    set((state) => {
      const next = toAuthUser(user);
      return sameAuthUser(state.user, next) ? {} : { user: next };
    }),
  setReady: (ready) => set({ ready }),
  setSyncing: (syncing) => set({ syncing }),
  setSyncError: (syncError) => set({ syncError }),
  setEndingSession: (endingSession) => set({ endingSession }),
}));
