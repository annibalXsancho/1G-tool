# Ajouter un calculateur

1. **Règle métier** (si nouvelle) : fonction pure en SI dans `src/thermo/` (ou un module voisin), avec en commentaire
   le bilan ou la source dont elle découle, et ses tests (cas chiffré à la main + cas limites).
2. **Données** : toute valeur tabulée dans `src/data/<nom>.json` avec `meta` (titre, source, date, note), son type dans
   `schema.ts` et un test de forme dans `data.test.ts`.
3. **Fichier du calculateur** `src/engines/<id>.ts` : `export const x = defineCalculator<Entrées, Sorties>({ … })` avec
   - `id`, `title`, `category`, `summary` (une phrase) ;
   - `inputs` : schéma déclaratif (nombre avec `dimension`, `units`, défaut **en SI**, bornes ; choix ; lignes) et `showIf` ;
   - `compute` : retourne `main`, `intermediates`, `warnings` (`validity` = hors domaine), `formulas`
     (`symbolic`, `substituted`, `legend`, `note`), `conclusion`, éventuellement `display` (`table`) ;
     l'envelopper dans `guarded()` s'il appelle le module vapeur ;
   - `method`, `scope`, `related`, `references`, `assumptions`, `validity`.
   Champs vapeur et coût communs : `src/engines/shared/vapeur.ts`.
4. **Test** `src/engines/<id>.test.ts` : au moins deux cas de référence sourcés, les cas limites (débit nul, division
   par zéro, hors domaine).
5. **Registre** : une ligne d'import et une entrée dans `src/engines/registry.ts`.
6. `npm test` puis `npx tsc --noEmit` : tout doit passer. Le test générique du registre vérifie aussi les valeurs par
   défaut, le LaTeX et les outils liés.

Aucun fichier de `src/ui/` ou `src/app/` n'est à modifier : navigation, route, formulaire, résultat et note A4 sont
générés depuis le schéma. Pour une nouvelle unité : ajouter la dimension dans `src/core/units.ts` (le test d'aller-retour
la couvre automatiquement).
