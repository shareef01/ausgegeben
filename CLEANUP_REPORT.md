# Cleanup report — 2026-09-04

Base: `main` @ `979c0959` (v2.0.4).
Cleanup branch: `cleanup/20260904-unused-files`.
Backup branch: `backup/pre-cleanup/20260904` (same SHA).

## Avoid list (applied)

Never touched: `.git/`, `.github/`, CI workflows, `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `AGENTS.md`, `README.md`, `testdata/`, `tools/error-endpoint/`, Gradle wrappers, signing examples, screenshots, i18n catalogs, and any file with a source/test/CI/docs reference.

Dependencies in use (not candidates): Firebase, Compose, Hilt, keep rules, Vite/React, Vitest.

## Summary

| Action | Count |
|---|---|
| Tracked files removed | 4 |
| False positive restored | 1 (`TabSwipe.kt`) |
| `.gitignore` additions | `.reasonix/` |
| Left on disk (manual review) | untracked `web/src/utils/categoryReorder.ts` (+ test) |

## Removed files

### `app/src/main/java/com/aus/ausgegeben/util/DisplayUtils.kt`

- **Reason:** `enableHighRefreshRate` is never called. MainActivity does not import `DisplayUtils`.
- **Heuristics:** import/symbol search; no string/`AndroidManifest` references.
- **Evidence:** repo-wide search for `enableHighRefreshRate`, `DisplayUtils` — hits only this file.

### `app/src/main/java/com/aus/ausgegeben/ui/components/AppBrandMark.kt`

- **Reason:** `AppBrandMark` is never composed. Auth uses `AppBrandIcon`.
- **Heuristics:** symbol search for `AppBrandMark(`.
- **Evidence:** only the definition. `AppBrandIcon` is used from `AuthScreen.kt`.

### `app/src/main/java/com/aus/ausgegeben/ui/components/AppInteractions.kt`

- **Reason:** `premiumClickable` is never applied. `rememberReduceMotion` still lives in `ReduceMotion.kt` and is used elsewhere.
- **Heuristics:** symbol search for `premiumClickable`.
- **Evidence:** only the definition in this file.

### `app/src/main/res/drawable/placeholder.png`

- **Reason:** not referenced as `R.drawable.placeholder` or `@drawable/placeholder`. Not the app launcher (mipmap webp / XML). Leftover stub drawable.
- **Heuristics:** resource-name search.
- **Evidence:** no `@drawable/placeholder` / `R.drawable.placeholder` in the tree.

### `.gitignore` — `.reasonix/`

- **Reason:** local editor topic metadata, never referenced by the app. Same class as `.cursor/` / `.agent/`.
- **Evidence:** was untracked; grep for `reasonix` in tracked files: no hits.

## False positive (restored)

### `app/src/main/java/com/aus/ausgegeben/ui/components/TabSwipe.kt`

Removed in `f39af0f8`, restored in `473b8fc5`. Search for `tabHorizontalSwipe` found no external callers; `MainTabPager` uses `SwipeableTabSurface` from the same file. `compileProdDebugKotlin` failed with `Unresolved reference 'SwipeableTabSurface'`. Marked used.

## Manual review (not deleted)

### Untracked `web/src/utils/categoryReorder.ts` and `categoryReorder.test.ts`

Local leftovers from a pre-merge WIP. Tracked `CategoriesView.tsx` implements `moveCategory` inline and does not import `categoriesAfterMove`. Not in git, so not `git rm`. Left on disk so a later change can wire them up or discard them.

### Stash `stash@{0}` (`wip-ui-currency-reorder`)

Unrelated UI/currency WIP. Not part of this cleanup.

## Tests / build after cleanup

| Command | Result |
|---|---|
| `cd web && npm test` | 117 passed |
| `cd web && npm run lint` | tsc --noEmit OK |
| `cd web && npm run lint:css` | 459 class tokens, no undefined utilities |
| `./gradlew :app:testProdDebugUnitTest` | **163 passed**, 0 failures (after restoring TabSwipe.kt) |
| `connected*` | **Not run** (Pixel 7 attached) |

## Revert

```bash
git checkout main
git reset --hard backup/pre-cleanup/20260904
```

To restore only the four removed files:

```bash
git checkout 979c0959 -- \
  app/src/main/java/com/aus/ausgegeben/util/DisplayUtils.kt \
  app/src/main/java/com/aus/ausgegeben/ui/components/AppBrandMark.kt \
  app/src/main/java/com/aus/ausgegeben/ui/components/AppInteractions.kt \
  app/src/main/res/drawable/placeholder.png
```
