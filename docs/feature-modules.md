# Feature Modules

## Principle

Every source belongs to the folder of the feature it serves: **feature > sub-feature > resource**, applied recursively.

## Template Structure

```
src/lib/<feature>/
  context/                    # React Context(s) — provider + useXxxContext()
  store/                      # Zustand store (if global state is needed)
  db/                         # Supabase CRUD + migrations
  hooks/                      # React hooks specific to the feature
  components/                 # UI components used across the feature
    <ComponentName>/
      <ComponentName>.tsx
      <ComponentName>.module.css
  <SubFeature>/               # Autonomous sub-feature — same rules recursively
    <SubFeature>.tsx
    <SubFeature>.module.css
    hooks/
    components/
      <ChildComponent>/
        <ChildComponent>.tsx
        <ChildComponent>.module.css
  shared/                     # Shared between ≥2 sub-features
    utils/
    styles/
    types/
```

## Rules

1. **Component folder only when ≥2 files.** A component with both `.tsx` and `.module.css` gets a folder `ComponentName/ComponentName.tsx` + `ComponentName.module.css`. A component with only a `.tsx` (no CSS) stays as a flat file.
2. **No barrel exports.** No `index.ts`. Import the file directly: `import { Foo } from '@/lib/feature/components/Foo/Foo'`.
3. **Page-specific code lives with the page.** Components used by a single page go in `src/app/<page>/components/`. Hooks used by a single page go in `src/app/<page>/`. Only code shared across ≥2 pages belongs in `src/lib/<feature>/`.
4. **Generic infrastructure stays in its own module.** `src/lib/supabase/` owns auth, the sync queue, and the Supabase client. A feature module imports from it but does not own it.
5. **`shared/` only for things used by ≥2 sub-features.** Don't preemptively create `shared/` for a single consumer — move to `shared/` when the second consumer appears.
6. **Sub-features follow the same rules recursively.** A sub-feature folder can have its own `hooks/`, `components/`, `shared/`, etc.
7. **Folders only when there are ≥2 files.** A single hook doesn't need a `hooks/` folder. Create the folder when a second file of the same type appears.

## Where Things Do NOT Go

| Source type                        | Does NOT go in `src/lib/<feature>/` | Goes in                                     |
| ---------------------------------- | ----------------------------------- | ------------------------------------------- |
| Next.js route                      | `src/lib/<feature>/page.tsx`        | `src/app/<feature>/page.tsx`                |
| Page-specific component            | `src/lib/<feature>/components/`     | `src/app/<page>/components/`                |
| Page-specific hook                 | `src/lib/<feature>/hooks/`          | `src/app/<page>/useXxx.ts`                  |
| Supabase client                    | any feature folder                  | `src/lib/supabase/client.ts`                |
| Auth state                         | any feature folder                  | `src/lib/supabase/contexts/AuthContext.tsx` |
| Sync queue                         | any feature folder                  | `src/lib/supabase/sync-queue.ts`            |
| Generic UI (Button, Modal, Navbar) | any feature folder                  | `src/components/ui/`                        |

## Decision Guide

When adding a new file, ask:

```
Is it used by a single page only?
  Yes → src/app/<page>/components/ (component) or src/app/<page>/useXxx.ts (hook)
  No  → does it belong to a specific feature?
    Yes → src/lib/<feature>/
      Is it a component?  → components/<ComponentName>/<ComponentName>.tsx
      Is it a hook?       → hooks/useXxx.ts
      Is it a DB layer?   → db/<name>.ts
      Is it a store?      → store/<name>.ts
      Is it a context?    → context/<Name>Context.tsx
      Is it shared between ≥2 sub-features? → shared/utils/ or shared/styles/
      Is it a sub-feature? → <SubFeature>/ (apply rules recursively)
    No → is it generic UI?
      Yes → src/components/ui/
      No  → is it Supabase infrastructure?
        Yes → src/lib/supabase/
        No  → src/lib/<domain>/ or src/hooks/ (app-wide hooks)
```

## Example: Collection Feature

Shared code (used by ≥2 pages) stays in `src/lib/collection/`:

```
src/lib/collection/
  context/
    CollectionContext.tsx           # Provider + useCollectionContext()
  store/
    collection-store.ts             # Zustand store; localStorage + Supabase hydration
  db/
    collection.ts                   # Supabase CRUD: fetchCollection, insertEntry, deleteEntryById…
    collection-migrations.ts        # Migrates legacy localStorage formats to current schema
  components/
    AddToCollectionButton/          # Used by collection page + card detail page → shared
  CardCollectionModal/              # Sub-feature: used by collection + card detail via AddToCollectionButton
    CardCollectionModal.tsx
    CardCollectionModal.module.css
    hooks/
      useCardCollectionModal.ts     # Modal state: selected stack, handlers
    components/
      CopyEditModal/                # Edit a single copy (foil, condition, language, price…)
      PrintPickerModal/             # Pick a different printing/language
  utils/
    filterCollectionCards.ts        # Pure filter function (no state) over Card[]
    stats.ts                        # computeCollectionStats()
    format.ts                       # Formatting helpers
  constants.ts
```

Page-specific code lives with the page in `src/app/collection/`:

```
src/app/collection/
  page.tsx                          # Next.js route
  layout.tsx
  page.module.css
  useCollectionCards.ts             # Page-specific hook (entries → Card[] + CardStack[])
  useCollectionFiltering.ts         # Page-specific hook (filter + sort state)
  components/
    CollectionFiltersAside/         # Filter sidebar — only used on this page
    ImportModal/                    # Import flow — only used on this page
```

Per rule 3, any hook, util, or context used exclusively by this page belongs here — not in `src/lib/collection/`.

Infrastructure stays in `src/lib/supabase/`:

```
src/lib/supabase/
  client.ts                         # Used by db/collection.ts but owned by supabase module
  sync-queue.ts                     # Generic offline queue — not collection-specific
  hooks/useSyncQueue.ts             # Drives the sync loop
  contexts/SyncQueueContext.tsx     # triggerSync() provider
```
