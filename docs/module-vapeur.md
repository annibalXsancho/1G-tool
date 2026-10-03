# Module thermodynamique vapeur (`src/thermo/`)

Fonctions pures en **SI strict** (Pa, K, J/kg, J/(kg·K), m³/kg, kg/s, W). Aucune dépendance à React ni au DOM.
Tout calculateur qui touche à l'eau ou à la vapeur passe par ce module, jamais par une table copiée dans son fichier.

## `steam.ts` : propriétés de l'eau et de la vapeur
- Basé sur IAPWS-IF97 (paquet `iapws-if97`, MIT), isolé dans ce seul fichier.
- Entrées : `statePT(p,T)`, `statePH(p,h)`, `statePS(p,s)`, `statePx(p,x)`, `saturationP(p)`, `saturationT(T)`, `Tsat(p)`.
- Sortie `SteamState` : phase, p, T, h, s, u, v, ρ, titre x, cp, écart à la saturation `dTsat`.
- Domaine : 612 Pa à 16 MPa, 0 à 800 °C (régions 1, 2 et 4). Au-delà : `SteamDomainError`, jamais d'extrapolation.
- Origine des enthalpies : celle d'IF97 (liquide saturé au point triple). Seules les différences comptent.
- Vérifié contre les valeurs de vérification publiées avec IF97 (`steam.test.ts`).

## `rules.ts` : règles métiers (bilans de masse et d'énergie)
| Fonction | Règle |
|---|---|
| `flashSteam` | fraction de vapeur flash d'un condensat détendu : x = (h_cond − h_f,bas)/h_fg,bas |
| `throttle` | détendeur : isenthalpique, h2 = h1 |
| `desuperheat` | eau d'injection : m_w/m_s = (h_s − h_t)/(h_t − h_w) |
| `steamPower` | Q = ṁ (h_vapeur − h_alimentation) |
| `boilerEfficiencyDirect` | η = Q / (ṁ_comb · PCI) |
| `blowdown` | purge : B/S = c_alim/(c_chaudière − c_alim), perte B (h_f − h_alim) |
| `steamForDuty` | débit de vapeur pour une puissance de chauffe (chaleur latente par défaut) |
| `condensateReturnPower` | énergie des condensats renvoyés vs appoint |
| `turbineExpansion` | détente avec rendement isentropique η_is |
| `napierLeak` | fuite de vapeur par un orifice (Napier), écoulement critique |

## `combustion.ts` : combustion et économie
| Fonction | Règle |
|---|---|
| `co2PerJoulePCI` | facteur d'émission GIEC 2006 (combustibles.json) |
| `priceOnPCI` | prix PCS → PCI : p_PCI = p_PCS / (PCI/PCS) |
| `etaOnPCS` | η_PCS = η_PCI × PCI/PCS |
| `siegertLoss` | pertes fumées : (T_f − T_a)(A2/(21 − O2) + B) |
| `steamUnitCost` | énergie, coût et CO2 par kg de vapeur : (h_v − h_alim)/η × prix |

Les erreurs d'entrée lèvent `RuleError` ; les calculateurs les convertissent en `Result` `ok: false`.

## Ajouter une règle
1. Écrire la fonction pure dans `rules.ts` avec en commentaire le bilan dont elle découle.
2. Ajouter dans `rules.test.ts` un cas chiffré à la main et les cas limites.
3. L'utiliser depuis un calculateur de `src/engines/`.

Exemple d'usage complet : `src/engines/proprietes-vapeur.ts`.
