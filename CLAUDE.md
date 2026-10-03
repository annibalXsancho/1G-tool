# Énergie · Calculs — conventions du projet

Application web statique (Next.js `output: 'export'`, TypeScript strict, Tailwind, KaTeX, Vitest) de calculs
d'ingénierie énergétique. Aucun backend, aucune route API : tout tourne dans le navigateur, hors ligne après chargement.

## Commandes
Node est installé dans `~/.local/node` : préfixer par `export PATH=$HOME/.local/node/bin:$PATH`.
- `npm test` : tous les tests (doivent toujours passer avant un commit).
- `npx tsc --noEmit` : typage.
- `npm run build` : export statique dans `out/` + précache du service worker.

## Architecture
- `src/core/` : types (`Calculator`, `Result`, `Formula`…), unités, parsing des formulaires, état URL, formatage. Pur.
- `src/thermo/` : **règles métiers** vapeur et combustion, fonctions pures en SI. `steam.ts` (IAPWS-IF97) est le
  seul fichier qui importe la bibliothèque `iapws-if97`. Voir `docs/module-vapeur.md`.
- `src/engines/` : un fichier par calculateur + son test ; `registry.ts` les liste ; `shared/` pour les champs communs.
- `src/site/` : modèle énergétique du site (postes, flux), contrôles et bilans (`analyse.ts`), import/export Excel
  sur des feuilles déjà lues (`excel.ts`, pur). La lecture/écriture .xlsx (read-excel-file / write-excel-file) est
  dans `src/ui/site/`. Le modèle courant est conservé dans le localStorage ; le fichier
  Excel exporté sert de sauvegarde.
- `src/metering/` : plans de comptage (pur) : `model.ts` (postes, compteurs, plans), `analyse.ts` (états mesuré / agrégé /
  par différence / inconnu, couverture pondérée, contrôles, recommandations), `layout.ts` (mise en page automatique),
  `excel.ts` (import/export multi-plans), `drawio.ts` (export diagrams.net), `edit.ts` (modifications pures). Le rendu
  SVG est dans `src/ui/metering/PlanSvg.tsx` (variante « sheet » pour les exports et l'impression A4 paysage).
- `src/ecs/` : dimensionnement d'une production d'ECS collective (pur) : `calc.ts` (besoins, pointes COSTIC, bilan
  stock + production, couples puissance-volume, trois modes, pertes, vérifications réglementaires, formules de la note),
  données dans `src/data/ecs.json`. Le schéma animé est `src/ui/ecs/SchemaSvg.tsx` (animations CSS `.ecs-*` dans
  `globals.css`, variante « sheet » statique pour l'export), les graphiques `src/ui/ecs/charts.ts`, la page `EcsPage.tsx`.
- `src/suivi/` : suivi énergétique (pur) : `dju.ts` (DJU/DJR Costic), `regress.ts` (moindres carrés, Student), `aggregate.ts`
  (jour → semaine/mois, périodes incomplètes écartées), `analyse.ts` (signature, économies IPMVP option C avec
  incertitude, CUSUM, IPÉ, normalisation, contrôles), `parse.ts` (CSV/Excel), `exemple.ts` (jeu déterministe). Algorithmes
  repris du tableau de bord `energy-dashboard` (`js/weather.js`). UI : `src/ui/suivi/`, route `/suivi/`.
- `src/lib/undo-store.ts` : stockage local + annulation, utilisé par le modèle de site et les plans de comptage.
- `src/data/` : JSON datés et sourcés (`meta.source`, `meta.date`), typés dans `schema.ts`, vérifiés par `data.test.ts`.
- `src/ui/`, `src/app/` : rendu générique. Aucune connaissance d'un calculateur particulier.

## Règles
- Moteurs : aucun import React/DOM, entrées et sorties en SI. Les erreurs métier (`RuleError`, `SteamDomainError`)
  deviennent `{ ok: false }` via `guarded()`.
- Toute valeur tabulée va dans `src/data/*.json`, jamais en dur dans le code.
- Chaque formule et chaque coefficient porte un commentaire de source. En cas de doute : `TODO: source à vérifier`
  dans le code ET dans `references[].note` ou `assumptions`. Ne jamais inventer une norme ou une valeur.
- Chaque calculateur fournit : `method` (principe en langage courant), formules avec `legend` des symboles et `note`
  sur les coefficients, `conclusion` en une phrase, `scope` (ce qui n'est pas vérifié), `related`.
- LaTeX : les formules sont validées par KaTeX dans `registry.test.ts`. Écrire `\\` dans les chaînes JS.
  Applications numériques longues : `\begin{aligned} … \\ … \end{aligned}`.
- Tests par moteur : ≥ 2 cas de référence chiffrés (source en commentaire) + cas limites.
- Graphiques : Plotly (`plotly.js-dist-min`), uniquement via `src/ui/charts/PlotlyChart.tsx` (chargement à la
  demande, thème lu dans les tokens CSS, export PNG/SVG en thème clair via `exportChart`). Un graphique = une fonction
  `build(theme) → { data, layout }`. Un seul axe des ordonnées par graphique (pas de double axe).
- Couleurs des énergies : palette catégorielle validée (tokens `--series-*`), emplacement fixe par énergie usuelle
  (`src/ui/site/carriers.ts`) ; les exports d'images utilisent le thème clair.
- Interface : tokens CSS (`globals.css`), thèmes clair/sombre, chiffres en `tabular-nums`, pas d'ombres ni de dégradés.
- Un commit par calculateur.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
