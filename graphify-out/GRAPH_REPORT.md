# Graph Report - alpeka-shop  (2026-11-05)

## Corpus Check
- 50 files · ~22,963 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: .example 1, (none) 1)

## Summary
- 316 nodes · 699 edges · 14 communities (13 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- index.tsx
- core.test.ts
- package.json
- ajustes.tsx
- expo
- dependencies
- generate-assets.mjs
- app/_layout.tsx
- compilerOptions
- sqlite-shim.tsx
- AGENTS.md
- Alpeka Shop
- (tabs)/_layout.tsx
- native-tabs-shim.tsx

## God Nodes (most connected - your core abstractions)
1. `react-native` - 21 edges
2. `react` - 19 edges
3. `colors` - 17 edges
4. `expo` - 15 edges
5. `useLayout()` - 15 edges
6. `space` - 14 edges
7. `SqlDb` - 12 edges
8. `AppText` - 11 edges
9. `expo-router` - 10 edges
10. `getProduct()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Ready()` --calls--> `checkForUpdate()`  [EXTRACTED]
  src/app/_layout.tsx → src/services/updates.ts
- `TabsLayout()` --calls--> `getSetting()`  [EXTRACTED]
  src/app/(tabs)/_layout.tsx → src/db/settings.ts
- `SettingsScreen()` --calls--> `getSetting()`  [EXTRACTED]
  src/app/(tabs)/ajustes.tsx → src/db/settings.ts
- `SettingsScreen()` --calls--> `shortDate()`  [EXTRACTED]
  src/app/(tabs)/ajustes.tsx → src/lib/dates.ts
- `ScanScreen()` --calls--> `useLayout()`  [EXTRACTED]
  src/app/(tabs)/index.tsx → src/hooks/use-layout.ts

## Import Cycles
- None detected.

## Communities (14 total, 1 thin omitted)

### Community 0 - "index.tsx"
Cohesion: 0.09
Nodes (47): expo-router, expo-sqlite, react, react-native, styles, Welcome(), ProductScreen(), styles (+39 more)

### Community 1 - "core.test.ts"
Cohesion: 0.10
Nodes (39): ref_node_assert, ref_node_sqlite, ref_node_test, Errors, ProductForm(), styles, SettingsScreen(), ScanScreen() (+31 more)

### Community 2 - "package.json"
Cohesion: 0.05
Nodes (40): { defineConfig }, expoConfig, devDependencies, eslint, eslint-config-expo, eslint-import-resolver-typescript, react-dom, react-native-web (+32 more)

### Community 3 - "ajustes.tsx"
Cohesion: 0.13
Nodes (24): expo-application, expo-file-system, expo-intent-launcher, errorText(), styles, UpdatesCard(), UPDATE_MANIFEST_URL, updatesConfigured() (+16 more)

### Community 4 - "expo"
Cohesion: 0.07
Nodes (28): backgroundColor, foregroundImage, monochromeImage, adaptiveIcon, blockedPermissions, package, permissions, reactCompiler (+20 more)

### Community 5 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, expo, expo-application, expo-build-properties, expo-camera, expo-constants, expo-document-picker, expo-file-system (+12 more)

### Community 6 - "generate-assets.mjs"
Cohesion: 0.11
Nodes (14): config, { getDefaultConfig }, path, webShims, expo, ref_node_crypto, ref_node_fs, ref_node_module (+6 more)

### Community 7 - "app/_layout.tsx"
Cohesion: 0.18
Nodes (6): expo-splash-screen, expo-status-bar, DatabaseBoundary, Ready(), styles, theme

### Community 8 - "compilerOptions"
Cohesion: 0.20
Nodes (9): expo/tsconfig.base, compilerOptions, allowImportingTsExtensions, noEmit, paths, strict, extends, include (+1 more)

### Community 9 - "sqlite-shim.tsx"
Cohesion: 0.20
Nodes (5): SqlValue, Context, db, Row, store

### Community 10 - "AGENTS.md"
Cohesion: 0.33
Nodes (5): Building with EAS, Commands, Expo has changed — do not trust your training data, Navigation & Routing, Rules

### Community 11 - "Alpeka Shop"
Cohesion: 0.33
Nodes (5): Alpeka Shop, Estructura, Primer APK, Probar en desarrollo, Publicar una actualización

### Community 12 - "(tabs)/_layout.tsx"
Cohesion: 0.47
Nodes (4): TabsLayout(), ICONS, getSetting(), SettingKey

## Knowledge Gaps
- **137 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+132 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 163 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `index.tsx` to `core.test.ts`, `package.json`, `ajustes.tsx`, `app/_layout.tsx`, `sqlite-shim.tsx`, `(tabs)/_layout.tsx`, `native-tabs-shim.tsx`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Why does `react-native` connect `index.tsx` to `core.test.ts`, `package.json`, `ajustes.tsx`, `app/_layout.tsx`, `native-tabs-shim.tsx`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _137 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09326923076923077 - nodes in this community are weakly interconnected._
- **Should `core.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09545454545454546 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._