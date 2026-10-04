# Roadmap de sprints

Hypothèses à confirmer : développement en solo, **sprint = 2 semaines** (environ 20 h de travail), un sprint livre des modules
utilisables et testés, jamais des morceaux de modules. Si le rythme réel est différent, on garde l'ordre et on ajuste le découpage.
Le backlog détaillé reste dans `docs/backlog.md` ; cette roadmap l'ordonne.

## État au départ (octobre 2026)

| Domaine | Livré |
|---|---|
| Vapeur et chaufferie | 8 calculateurs (propriétés IAPWS-IF97, coût, flash, purge, condensats, purgeur, rendement chaudière) |
| Thermique | puissance d'un fluide |
| Site et livrables | modèle de site, Sankey, bilans, plans de comptage, schémas unifilaires |
| Plomberie | ECS collective (schéma animé) |
| Suivi | signature énergétique, IPÉ, CUSUM, économies IPMVP option C |
| Monitoring | courbes de charge, KPIs, qualité, cartes de contrôle, simulation IPMVP |
| Qualité | 311 tests, build statique, hors ligne |

Points faibles connus : environ 25 mentions `TODO: source à vérifier` réparties dans 12 fichiers ; pas de dépôt distant ni d'intégration continue ;
composants d'interface dupliqués (`Section`, `Stat`, `CheckList` dans 3 pages) ; courbe de charge non conservée au rechargement ;
aucun lien entre le modèle de site, les plans de comptage et le monitoring ; le module « pertes de charge » demandé au tout début n'existe pas.

## Principes d'ordonnancement

1. Ce qui sert un audit réel passe avant ce qui est élégant (valeur directe = P1 du backlog).
2. Chaque sprint finit par **un commit par module**, tests verts, `tsc` propre, build statique, vérifié dans le navigateur.
3. Aucune valeur inventée : toute source manquante est tracée dans `docs/sources-a-verifier.md` et résorbée à date fixe.
4. On construit d'abord les briques que plusieurs modules réutilisent (hydraulique, plan d'actions), puis les modules qui les consomment.

## Sprints

### Sprint 1 · Fondations et dette (prérequis de tout le reste)
- Dépôt GitHub pour EnergyEngTool, intégration continue (`tsc`, `npm test`, `npm run build`) sur chaque PR.
- `docs/sources-a-verifier.md` : inventaire des `TODO: source à vérifier`, avec propriétaire et échéance ; un test échoue si un TODO n'y figure pas.
- Extraire `Section`, `Stat`, `CheckList`, `Tabs` dans `src/ui/common.tsx` pour les pages ECS et Suivi (déjà fait pour Monitoring).
- Conserver la courbe de charge du monitoring dans IndexedDB (relevé annuel à 10 min).
- Test de fumée automatisé des pages (chargement de l'exemple sur `/ecs`, `/suivi`, `/monitoring`, aucune erreur console), car la vérification visuelle manuelle est fragile.
- **Critère d'acceptation** : une PR rouge bloque la fusion ; recharger `/monitoring/` retrouve le relevé.

### Sprint 2 · Pertes de charge (hydraulique, 1ʳᵉ demande)
- Perte de charge linéique (Darcy-Weisbach, Colebrook-White itératif, Swamee-Jain en contrôle), pertes singulières par coefficients ζ tabulés dans `src/data/`.
- Calculateur de conduite (débit, diamètre, rugosité, fluide depuis `fluides.json`), réseau en série avec cumul par tronçon, vitesse limite conseillée.
- Graphique de la perte cumulée le long du réseau (Plotly) et note de calcul.
- Sources à prendre dans votre cours `HYDRAULIQUE/` ; valeurs non couvertes marquées à vérifier.
- **Critère** : au moins 3 cas chiffrés de référence sourcés, écart < 1 % avec Colebrook résolu à la main.

### Sprint 3 · Pompes, ventilateurs, variation de vitesse
- Courbe de réseau + courbe de pompe, point de fonctionnement (réutilise le sprint 2).
- Lois de similitude, économie par variateur sur un profil par paliers, temps de retour.
- Remplacement d'une pompe ou d'un ventilateur : rendement avant/après.
- **Critère** : le point de fonctionnement d'un cas du cours est retrouvé au pourcent près.

### Sprint 4 · Électricité : réactif, transformateurs, moteurs
- Compensation d'énergie réactive (kvar pour un cos φ visé, économie de pénalités avec barème saisi).
- Pertes et taux de charge des transformateurs (à vide, en charge, rendement maximal).
- Moteurs : rendement, passage à une classe supérieure.
- Liaison avec les schémas unifilaires (récupérer transformateurs et moteurs du schéma).
- **Critère** : un schéma unifilaire d'exemple alimente directement les trois calculateurs.

### Sprint 5 · Plan d'actions chiffré (le hub)
- Registre d'actions : gain (kWh, €, tCO2), investissement, temps de retour, VAN, TRI (cours « Finances » à compléter).
- Chaque calculateur peut « ajouter au plan d'actions » son résultat.
- Hiérarchisation (matrice gain / investissement), cumul avec effet d'interaction signalé.
- Facteurs d'émission et prix de l'énergie dans `src/data/`, datés et sourcés.
- **Critère** : trois calculateurs différents alimentent un même plan exportable en Excel.

### Sprint 6 · Bilan par usage et UES, pont entre les outils
- Bilan par usage, usages énergétiques significatifs (UES) avec seuils paramétrables, Pareto.
- Lien modèle de site ↔ plan de comptage ↔ monitoring : mêmes postes, mêmes compteurs ; importer un compteur du plan dans le monitoring.
- Écart entre consommation facturée, mesurée et modélisée par poste.
- **Critère** : un poste du Sankey ouvre sa courbe de charge dans le monitoring.

### Sprint 7 · Utilités : air comprimé, froid, récupération de chaleur
- Air comprimé : coût du m³, fuites, baisse de pression, récupération de chaleur.
- Froid industriel : COP, pression flottante, free-cooling.
- Échangeur (NUT-efficacité), économiseur de fumées, condensation (prolonge le module vapeur).
- Calorifuge : pertes nues vs isolées, épaisseur économique.
- **Critère** : chaque calculateur a ≥ 2 cas de référence sourcés et un lien vers le plan d'actions.

### Sprint 8 · Dossier de synthèse et rapports
- Dossier imprimable : couverture, Sankey, plan de comptage, signature, plan d'actions, hypothèses et sources.
- Export PDF fiable (mise en page A4 testée), gabarit de rapport d'audit (procédure type EN 16247 à confirmer).
- **Critère** : un audit complet de l'exemple sort en un dossier de moins de 15 pages sans retouche.

### Sprint 9 · Monitoring v2
- Normaliseurs d'import (export Enedis, sous-comptage propriétaire), annotation d'événements sur la courbe.
- Modèles à changement de pente (3 paramètres), correction climatique entre deux périodes choisies.
- Alertes configurables et résumé hebdomadaire ; option D (simulation calibrée) : étude de faisabilité seulement.
- Signature énergétique et IPÉ : reprise des sources à vérifier avec l'IPMVP et l'ASHRAE 14 réels.
- **Critère** : un export Enedis réel s'importe sans désignation manuelle de colonnes.

### Sprint 10 · Réglementaire et bâtiment
- Déperditions d'un bâtiment (NF EN 12831), méthode de puissance de chauffage à partir des consommations (cours d'optimisation, formule à confirmer).
- Décret tertiaire et BACS : trajectoires, éligibilité, classe de GTB.
- ECS : variantes tertiaire à valider, modèle de boucle réelle (diamètres, isolation) à la place de la forfaitaire.

## Rituels et indicateurs

- **Fin de sprint** : démonstration sur l'exemple, mise à jour de ce fichier (livré, reporté, pourquoi).
- **Indicateurs suivis** : nombre de calculateurs ; part de formules avec source vérifiée ; tests ; temps de build ; nombre de `TODO` ouverts (doit baisser à chaque sprint).
- **Définition de « fini »** : tests de référence chiffrés, `tsc` et build propres, note de calcul avec légende et limites, pas d'erreur console, source ou `TODO` tracé.

## Risques

| Risque | Parade |
|---|---|
| Formules non sourcées présentées avec aplomb | Registre des sources, test bloquant, revue à date fixe |
| Dépendance à une seule personne et à une seule machine | Dépôt distant et CI dès le sprint 1 |
| Données client dans le dépôt | Données de démonstration seulement ; relevés réels hors dépôt (règle du Dashboard) |
| Périmètre qui enfle | Un module à la fois, critère d'acceptation écrit avant de coder |
| Vérification visuelle impossible en environnement masqué | Tests de fumée automatisés (sprint 1) |

## Décisions à prendre

1. Rythme réel (taille de sprint) et nombre d'heures disponibles par semaine.
2. Priorité entre **hydraulique** (sprints 2 et 3) et **plan d'actions** (sprint 5) : le second donne le plus de valeur d'audit, le premier est déjà demandé.
3. Faut-il ouvrir le dépôt aux collègues ou à l'école (alors : licences des données et des cours à clarifier) ?
4. Quels cours deviennent la référence officielle de chaque module (pour trancher les sources).
