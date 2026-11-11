# 6. Plan de réalisation et suivi

## 6.1 Décisions à prendre avant de coder

| # | Décision | Recommandation | Impact si différent |
|---|---|---|---|
| D1 | Stack technique | ✅ **Décidé** : NestJS + Next.js + **MongoDB Atlas** + **Cloudinary** (ADR 0001) ; Redis à partir de la phase 2 | — |
| D2 | Prestataire Mobile Money | Agrégateur (FedaPay ou KKiaPay) ; démarche marchand à lancer dès maintenant | Intégrations MTN et Moov séparées : plus long |
| D3 | Fournisseur SMS / WhatsApp | À choisir (opérateur local ou agrégateur) ; l'OTP par SMS est désactivé tant que rien n'est configuré | — |
| D4 | Hébergement | VPS avec Docker + PostgreSQL sauvegardé ; nom de domaine à acheter | — |
| D5 | Nom et logo de la plateforme | À fournir ; nom provisoire « Marketplace » | — |
| D6 | Règles commerciales | Qui finance les coupons ; politique d'annulation par statut ; délai de réponse des restaurants ; plafond d'espèces par livreur ; frais de service (oui/non) | Elles sont configurables, mais il faut des valeurs de départ validées par la direction |
| D7 | Langues | Français au MVP ; architecture prête pour l'anglais (i18n) | — |

## 6.2 Phases (chaque phase se termine par des tests et une démonstration avant la suivante)

| Phase | Contenu | Livrable vérifiable |
|---|---|---|
| **0. Fondations** | Monorepo, CI, Docker, PostgreSQL + migrations, RLS, authentification (inscription, connexion, mot de passe oublié, sessions, limitation de débit), RBAC + guards, journal d'audit, paramètres de la plateforme, **design system** (jetons, composants, maquettes clés mobile et ordinateur) | Tests d'authentification et de permissions verts ; catalogue des composants visible |
| **1. Catalogue et marketplace** | Zones (villes, communes, quartiers, grille de frais), candidature et validation des restaurants, profil et horaires, catégories, plats, variantes, suppléments, images ; accueil administrable, recherche avec filtres et tri, vitrine `/restaurants/[slug]` | Un restaurant validé publie un plat qui apparaît sur sa vitrine ; **tests d'isolation A/B sur l'API** |
| **2. Client et commande** | Compte, carnet d'adresses, panier serveur, validation, création de commande (idempotence, recalcul serveur, instantanés), machine à états, historique, suivi en temps réel, notifications dans l'application, **écritures financières au statut DELIVERED** | Scénarios 1 (jusqu'à READY) et 2 automatisés |
| **3. Restaurant et cuisine** | Tableau de bord (chiffres réels), gestion des commandes en temps réel avec alerte sonore, écran de cuisine en 4 colonnes, personnel et rôles, promotions | Scénario 6 (permissions des employés) automatisé |
| **4. Livreurs et opérations** | Inscription et documents des livreurs, validation, PWA (en ligne, offres, livraison active, OTP), dispatch manuel assisté, réattribution, carte (positions réelles uniquement), incidents, alertes de délai | Scénarios 1 complet et 3 automatisés |
| **5. Finances** | Grand livre et rapports, espèces des livreurs et reversements, versements aux restaurants (double validation), remboursements, exports PDF et Excel | Totaux du grand livre équilibrés ; rapports cohérents avec les commandes de test |
| **6. Administration et commercial** | Tableau de bord global, gestion des clients et livreurs, salariés de la plateforme, coupons, abonnements, publicités « Sponsorisé », avis et modération, tickets de support | Toutes les actions admin sont auditées |
| **7. Paiements électroniques et canaux** | Intégration Mobile Money (dès réception des accès de test), webhooks, rapprochement ; SMS, WhatsApp, e-mail, push web | Scénario 5 testé **sur l'environnement de test réel du prestataire** |
| **8. Durcissement et mise en production** | Tests de charge (k6), revue de sécurité, tests responsive sur appareils réels, sauvegarde et restauration testées, monitoring, documentation développeurs, **manuels des salariés avec captures réelles** | Checklist de mise en production validée |

> Différence avec l'ordre du §27 : les **écritures financières** sont posées dès la phase 2 (la première commande livrée doit produire ses écritures). Les écrans financiers arrivent en phase 5. Le paiement en espèces étant opérationnel dès la phase 2, Mobile Money peut être avancé dès que les accès arrivent.

### Définition du MVP commercialisable
Phases 0 à 5, plus de la phase 6 : validation des restaurants et livreurs, salariés, avis. Paiement en espèces. Mobile Money dès que l'agrégateur est prêt.

Les abonnements, publicités, la fidélité et l'affectation automatique viennent **après** le lancement.

## 6.3 Tableau de suivi des fonctionnalités

État : ⬜ Non commencé · 🟦 En cours · ✅ Terminé (développé + connecté + testé + documenté) · 🟥 Bloqué

| # | Fonctionnalité | Espace | Dépendances | État | Tests | Responsable | Validée le |
|---|---|---|---|---|---|---|---|
| F01 | Infrastructure monorepo, CI, Docker | Technique | — | ✅ | Typage, build, CI GitHub Actions écrite (pas encore exécutée sur GitHub) | Claude | 2026-11-11 |
| F02 | Schéma de base, migrations, RLS | Technique | F01 | ✅ | Plugins tenant et ajout seul testés ; rôle MongoDB fourni (non appliqué sur Atlas) | Claude | 2026-11-11 |
| F03 | Authentification et sessions | Tous | F02 | ✅ | 14 tests API + parcours navigateur mobile sur Atlas | Claude | 2026-11-11 |
| F04 | Rôles, permissions, guards | Tous | F03 | ✅ | Tests isolation A/B, rôles restaurant et plateforme | Claude | 2026-11-11 |
| F05 | Journal d'audit | Tous | F04 | ✅ | Tests ajout seul + traçabilité | Claude | 2026-11-11 |
| F06 | Design system et maquettes | Tous | — | 🟦 | Les 9 écrans client des maquettes reproduits en mobile (contenu démo), vérifiés dans le navigateur ; espaces professionnels à concevoir | Claude | — |
| F07 | Zones et grille de frais | Admin | F04 | ✅ | Tests API : versionnement de la grille, quartier unique par zone, droits ; écran admin | Claude | 2026-11-11 |
| F08 | Candidature et validation des restaurants | Restaurant/Admin | F04 | ✅ | Tests API : candidature, validation/refus motivé ; écrans candidature + admin | Claude | 2026-11-11 |
| F09 | Profil, horaires, aperçu du restaurant | Restaurant | F08 | ✅ | Tests API : brouillon/aperçu/publication, horaires de nuit, image d’un autre restaurant refusée | Claude | 2026-11-11 |
| F10 | Menu : catégories, plats, variantes, suppléments | Restaurant | F09 | ✅ | Tests API : cycle plat, variantes/suppléments, isolation A/B ; créé et publié via l’interface | Claude | 2026-11-11 |
| F11 | Accueil administrable | Public/Admin | F10 | 🟦 | Catégories administrables ; sections d’accueil (promotions, sponsorisés) à faire | Claude | — |
| F12 | Recherche, filtres, tri | Public | F10 | ✅ | Tests API : recherche sans accents, filtres, tri ; écran /recherche | Claude | 2026-11-11 |
| F13 | Vitrine `/restaurants/[slug]` | Public | F10 | ✅ | Vérifiée au navigateur sur Atlas + Cloudinary | Claude | 2026-11-11 |
| F14 | Compte client et carnet d'adresses | Client | F03, F07 | ✅ | Adresses : tests API + vérifié au navigateur | Claude | 2026-11-11 |
| F15 | Panier (invité et connecté) | Client | F10 | ✅ | Panier serveur (un seul restaurant) + panier invité transféré à la connexion | Claude | 2026-11-11 |
| F16 | Création de commande sécurisée | Client | F15, F14 | ✅ | Idempotence, recalcul, prix modifié, indisponibilité, zones, configuration : tests API + navigateur | Claude | 2026-11-11 |
| F17 | Machine à états et historique | Tous | F16 | ✅ | Transitions contrôlées, historique en ajout seul, restaurant ne peut pas livrer | Claude | 2026-11-11 |
| F18 | Temps réel et reconnexion | Tous | F17 | ✅ | Socket.IO authentifié, abonnements vérifiés, rechargement à la reconnexion ; vérifié au navigateur | Claude | 2026-11-11 |
| F19 | Notifications dans l'application | Tous | F17 | ✅ | Notifications in-app sans doublon ; SMS/e-mail en F42 | Claude | 2026-11-11 |
| F20 | Gestion des commandes côté restaurant | Restaurant | F17 | ✅ | Commandes en direct, refus motivé intégré, signalement de problème ; vérifié au navigateur | Claude | 2026-11-11 |
| F21 | Écran de cuisine | Cuisine | F20 | ✅ | 4 colonnes, minuteurs, alerte sonore et visuelle, retard ; aucune donnée client (testé API + navigateur) | Claude | 2026-11-11 |
| F22 | Personnel du restaurant | Restaurant | F04 | ✅ | Ajout, rôles, ajustements, invitation avec lien d’activation, réinitialisation restreinte ; tests API + navigateur | Claude | 2026-11-11 |
| F23 | Promotions | Restaurant | F10 | ✅ | Pourcentage/fixe, période, plats, minimum ; calcul serveur dans catalogue, devis, commande ; tests API + navigateur | Claude | 2026-11-11 |
| F24 | Tableau de bord du restaurant | Restaurant | F20, F27 | ✅ | Chiffres réels du jour et de la période, montants masqués sans permission financière ; tests API + navigateur | Claude | 2026-11-11 |
| F25 | Inscription et validation des livreurs | Livreur/Admin | F04 | ✅ | Dossier + documents privés (Cloudinary « authenticated », lien signé tracé), validation/refus/suspension ; tests API + navigateur | Claude | 2026-11-11 |
| F26 | PWA livreur et livraison avec OTP | Livreur | F25, F17 | ✅ | Application livreur : en ligne, offres en direct, étapes, code client (5 essais, validation unique), échec, désistement, gains ; tests + navigateur | Claude | 2026-11-11 |
| F27 | Grand livre et écritures de commande | Finances | F17 | 🟦 | Écritures à la livraison testées ; écrans finances en phase 5 | Claude | — |
| F28 | Dispatch et réattribution | Opérations | F26 | ✅ | Affectation, offres avec expiration, une course = un livreur, réattribution, plafond d’espèces ; tests + navigateur | Claude | 2026-11-11 |
| F29 | Carte opérationnelle | Opérations | F28 | ✅ | Leaflet/OpenStreetMap, positions réelles uniquement ; vérifiée au navigateur | Claude | 2026-11-11 |
| F30 | Incidents et alertes de délai | Opérations | F28 | ✅ | Incidents (statut, responsable, historique, résolution obligatoire), alerte « prête sans livreur » ; tests API | Claude | 2026-11-11 |
| F31 | Espèces des livreurs et reversements | Finances | F27 | ⬜ | — | — | — |
| F32 | Versements aux restaurants et livreurs | Finances | F27 | ⬜ | — | — | — |
| F33 | Remboursements | Finances | F27 | ⬜ | — | — | — |
| F34 | Rapports et exports PDF/Excel | Finances | F27 | ⬜ | — | — | — |
| F35 | Tableau de bord du super-admin | Admin | F27 | ⬜ | — | — | — |
| F36 | Salariés de la plateforme | Admin | F04 | ⬜ | — | — | — |
| F37 | Avis et modération | Client/Admin | F17 | ⬜ | — | — | — |
| F38 | Coupons | Admin | F16 | ⬜ | — | — | — |
| F39 | Abonnements et publicités | Admin | F35 | ⬜ | — | — | — |
| F40 | Support (tickets) | Client/Admin | F04 | ⬜ | — | — | — |
| F41 | Mobile Money | Paiements | F27, D2 | 🟥 | — | — | — |
| F42 | SMS, WhatsApp, e-mail, push | Notifications | F19, D3 | 🟥 | — | — | — |
| F43 | Tests de charge et revue de sécurité | QA | toutes | ⬜ | — | — | — |
| F44 | Documentation développeurs | Docs | toutes | ⬜ | — | — | — |
| F45 | Manuels des salariés | Docs | toutes | ⬜ | — | — | — |
| F46 | Mise en production | Ops | F43 | ⬜ | — | — | — |

F41 et F42 sont 🟥 **bloquées** jusqu'à réception des accès prestataires (D2, D3).

### Journal de la phase 0 (2026-11-11)
- MongoDB Atlas branché et vérifié (replica set détecté, transactions disponibles).
- Cloudinary branché et vérifié par un vrai téléversement signé : une signature falsifiée est rejetée, l'image de contrôle a été supprimée.
- Espace client reproduit écran par écran d'après les maquettes fournies, au format mobile uniquement. Accueil, carte, fiche plat, panier, paiement et suivi utilisent un contenu « Démo » en attendant les phases 1 et 2.
- Non vérifié : exécution de la CI sur GitHub, images Docker (Docker absent du poste), application de `init-app-user.js` sur Atlas.

### Journal de la phase 1 (2026-11-11)
- API : zones (villes, communes, quartiers), zones de livraison, grille de frais versionnée, catégories de cuisine, candidature et validation des restaurants, profil avec brouillon/aperçu/publication, horaires (dont créneaux après minuit, heure du Bénin), zones desservies, menu (catégories ordonnées, plats, variantes, suppléments, allergènes, photos Cloudinary), catalogue public (liste, filtres, tri, recherche sans accents, vitrine, fiche plat).
- 74 tests automatisés au vert (22 contrats + 52 API), dont l'isolation des menus entre deux restaurants testée directement sur l'API.
- Écrans client branchés sur l'API ; espace restaurant (/pro) et administration (/admin) livrés.
- Données « Démo » : `npm run seed:demo -- --owner-phone <numéro>` (refusé en production) ; 4 restaurants marqués Démo dans Atlas, photos sur Cloudinary.
- Non vérifié au navigateur : téléversement d'image depuis l'interface (sélecteur de fichier), écrans d'administration (aucun compte super-administrateur créé sur Atlas — à créer avec `npm run create-superadmin`).
- Reste de la phase 1 : sections d'accueil administrables (F11), rendu serveur des vitrines pour le référencement, filtres prix et frais (dépendent de l'adresse du client, phase 2).

### Journal de la phase 2 (2026-11-11)
- API terminée et testée (98 tests verts) : carnet d'adresses, panier serveur, devis serveur, commande idempotente (recalcul des prix, valeurs figées), machine à états avec historique, notifications in-app sans doublon, grand livre en partie double à la livraison, temps réel Socket.IO authentifié, alerte « restaurant sans réponse », contrats de commission versionnés.
- Scénarios 1 et 2 automatisés ; isolation des commandes testée sur l'API.
- Écrans livrés (typage OK) : panier serveur, paiement/validation, suivi en direct, historique, adresses, notifications, commandes restaurant en direct, paramètres et commissions en admin.
- Vérifié au navigateur (base locale, valeurs de test) : ajout au panier serveur → adresse → commande (5 200 FCFA recalculés par le serveur) → acceptation, préparation, prête, demande de livreur côté restaurant, suivi client mis à jour en direct (< 3 s) ; refus avec motif reçu en direct par le client.
- Corrigé pendant la vérification : formulaire d'adresse qui se rouvrait, refus par boîte de dialogue remplacé par un formulaire intégré, étape « En attente d'un livreur » ajoutée au suivi.
- Build de production, 98 tests et typage au vert ; 0 vulnérabilité.
- Hors phase 2 : étapes livreur (phase 4), écran cuisine et tableau de bord restaurant (phase 3).
- Pour ouvrir les commandes sur Atlas : paramètres (frais de service, délai de réponse), grille de frais, commission par restaurant, « commandes acceptées » côté restaurant.

### Journal de la phase 3 (2026-11-11)
- Écran cuisine `/cuisine/[id]` (tablette) : Nouvelles / À préparer / En préparation / Prêtes, temps écoulé, alerte sonore et visuelle, « Commencer », « Terminer », « Signaler un retard » (le client est prévenu). Aucune donnée client.
- Tableau de bord du restaurant : commandes du jour par état, chiffre d'affaires et net estimé (commandes livrées), graphique 1/7/30 jours, plats populaires, dernières commandes ; montants masqués sans `finance.restaurant.view`.
- Promotions : % ou montant fixe, période, plats, minimum de commande ; une seule par article (la meilleure) ; calcul serveur au catalogue, au devis, figé dans la commande ; la réduction diminue la base de commission.
- Personnel : création de compte salarié avec lien d'activation (72 h, usage unique, partage WhatsApp en attendant le SMS), réinitialisation d'accès limitée aux comptes créés par le restaurant.
- Signalement de problème (transmis aux opérations).
- Scénario 6 automatisé (permissions cuisinier, caissier, agent financier, isolation entre restaurants). Le volet « livreur » du scénario 6 arrive en phase 4.
- 111 tests, typage et build au vert ; vérifié au navigateur (base locale).

### Journal de la phase 4 (2026-11-11)
- Livreurs : inscription (véhicule, versements Mobile Money, documents privés), validation par l'administration, mise en ligne, partage de position avec accord.
- Dispatch (affectation manuelle assistée) : commandes à attribuer, livreurs disponibles, « Attribuer » ou « Proposer » (offres avec expiration), réattribution, nouvelle tentative, annulation.
- Garanties : une course n'a qu'un livreur (test de concurrence), un livreur n'a qu'une course, validation unique par code client (5 essais puis blocage + incident), plafond d'espèces paramétrable.
- Carte : positions réellement transmises uniquement ; distances affichées « non disponible » faute de coordonnées (aucune estimation inventée).
- Incidents : ouverture par restaurant, livreur, opérations ou système ; prise en charge, notes, résolution obligatoire, historique.
- Écritures financières à la livraison avec l'identifiant réel du livreur (espèces détenues, rémunération due).
- Scénarios 1 complet et 3 automatisés ; isolation entre livreurs testée. Total : 124 tests.
- Vérifié au navigateur (base locale) : dispatch → application livreur → mauvais code refusé → bon code → gains et espèces mis à jour ; carte.
- Corrigé pendant la vérification : les rafraîchissements en direct effaçaient l'écran (et la saisie du code) — corrigé à la source pour toute l'application.
- Paramètres à renseigner avant d'utiliser le dispatch : plafond d'espèces, durée des offres, délai d'alerte « prête sans livreur ».
