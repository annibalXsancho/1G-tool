# Backlog

Priorités : P1 = valeur directe en audit / management de l'énergie, P2 = utile, P3 = plus tard. Taille : S < 1 j, M 1–3 j, L > 3 j.

## Reporté volontairement
- **Monitoring** (courbes de charge, suivi en continu, alertes) : après les outils d'ingénierie.
  - Import CSV/Excel de relevés 10 min ou horaires, carte de chaleur heure × jour, profils types, monotone, talon et pointe. (P2, L)
  - Signature énergétique + IPÉ, situation de référence, cumul des écarts (CUSUM), logique ISO 50001 / IPMVP. (P1, M)

## Livrables
- Plan de comptage : **en cours** (voir `src/metering/`).
  - À venir : import d'un schéma draw.io existant (heuristique), fiches compteurs en PDF, lien avec le modèle de site (mêmes postes), coût d'instrumentation avec prix unitaires saisis. (P2)
- Bilan énergétique par usage et usages énergétiques significatifs (UES) avec seuils paramétrables, Pareto. (P1, M)
- Plan d'actions chiffré (gain €, MWh, tCO2, investissement, TRI), alimenté par les calculateurs. (P1, M)
- Dossier de synthèse imprimable (couverture, Sankey, plan de comptage, plan d'actions). (P2, M)

## Électricité
- Courant nominal, choix du TC et de la calibre (série normalisée de courants primaires). (P1, S) : complète le plan de comptage.
- Pertes et taux de charge des transformateurs (pertes à vide + pertes en charge, rendement maximal). (P1, S)
- Compensation de l'énergie réactive : kvar à installer pour un cos φ visé, économie de pénalités (barèmes saisis, jamais en dur). (P1, S)
- Pertes Joule et chute de tension dans les câbles. (P2, S)
- Moteurs : rendement, remplacement par une classe supérieure, temps de retour. (P1, S)
- Variateur de vitesse : lois de similitude, profil de fonctionnement par paliers. (P1, M)
- Puissance souscrite : simulation à partir de maxima mensuels saisis. (P2, M)

## Utilités
- Air comprimé : coût du m³, fuites, baisse de pression, récupération de chaleur. (P1, M)
- Froid industriel : COP, pression flottante, free-cooling. (P2, M)
- Récupération de chaleur : échangeur (NUT-efficacité), économiseur de fumées, condensation. (P1, M)
- Calorifuge : pertes d'une tuyauterie nue vs isolée, épaisseur économique. (P1, M)
- Pompes et ventilateurs : point de fonctionnement, rendement, remplacement. (P2, M)
- Cogénération / trigénération : rendement, économie d'énergie primaire (valeurs de référence réglementaires à saisir et sourcer). (P2, M)
- Eau : bilan, fuites, recyclage. (P3, M)
- Détendeur avec désurchauffe, consommation de vapeur d'un échangeur (règles déjà dans `src/thermo/rules.ts`). (P2, S)

## Thermique et conversions
- Déperditions d'un bâtiment (NF EN 12831, saisie multi-parois). (P2, L)
- Perte de charge en conduite (Colebrook-White itératif, singularités). (P2, M)
- Convertisseur énergie / coût / CO2 (kWh, MWh, GJ, tep, th ; PCI/PCS ; facteurs d'émission). (P1, S)
