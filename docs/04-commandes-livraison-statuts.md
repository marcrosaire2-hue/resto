# 4. Commandes, livraison et statuts

## 4.1 Création d'une commande (côté serveur, dans une transaction)
1. Vérifier la clé d'idempotence. Si elle est déjà utilisée, renvoyer **la même commande**, sans en créer une seconde.
2. Vérifier les conditions de commande :
   - le restaurant est actif et `accepting_orders` ;
   - il est ouvert maintenant, ou bien une commande programmée est autorisée et le créneau est valide ;
   - il n'est pas suspendu.
3. Vérifier que l'adresse est dans une zone desservie, puis appliquer la règle de frais en vigueur.
4. Recharger chaque produit, variante et supplément depuis la base : publiés et disponibles. Les prix envoyés par le navigateur sont ignorés.
5. Calculer avec le module `domain/pricing` : sous-total, promotions actives, coupon, frais de livraison, frais de service, total.
6. Si le total diffère de celui affiché au client, renvoyer `409 PRICE_CHANGED` avec le nouveau détail. Le client doit reconfirmer.
7. Figer les instantanés : noms, descriptions et prix des articles, adresse, contrat de commission, grille de frais.
8. Générer le numéro de commande, puis le code OTP de livraison (stocké haché ; le client le voit dans son suivi).
9. Créer la commande en `PENDING`, avec `accept_deadline_at = maintenant + délai configurable`.
10. Après validation de la transaction (outbox) : notifier le restaurant (WebSocket + son, et SMS optionnel), informer le client.

Pour Mobile Money, la commande est créée avec `payment_status = PENDING`. Elle n'est **transmise au restaurant qu'après confirmation vérifiée du paiement**. Elle est annulée automatiquement si le paiement expire.

## 4.2 Machine à états de la commande

```
                 ┌──────────── REJECTED ──┐
                 │                         │
 PENDING ──► ACCEPTED ──► PREPARING ──► READY ──► WAITING_FOR_COURIER ──► COURIER_ASSIGNED
    │            │            │                          ▲                     │   │
    │            │            │                          └──── réattribution ──┘   ▼
    └────────────┴────────────┴──► CANCELLED                                   PICKED_UP
                                        │                                          │
                                        ▼                                          ▼
                                  REFUND_PENDING ──► REFUNDED                 IN_DELIVERY
                                        ▲                                      │      │
                                        └──────────── DELIVERY_FAILED ◄────────┘      ▼
                                                                                 DELIVERED
```

### Transitions autorisées

| De | Vers | Qui (permission) | Conditions / effets |
|---|---|---|---|
| PENDING | ACCEPTED | restaurant `orders.accept` | avant `accept_deadline_at` ; notification au client |
| PENDING | REJECTED | restaurant `orders.reject` | **motif obligatoire** ; client notifié avec le motif ; remboursement si un paiement a été encaissé |
| PENDING | CANCELLED | client (selon la politique), ops `ops.orders.cancel`, système (délai dépassé si l'annulation automatique est activée) | |
| ACCEPTED | PREPARING | restaurant / cuisine `orders.prepare` | |
| ACCEPTED, PREPARING | CANCELLED | ops uniquement, motif obligatoire | ouvre un incident ; règle de prise en charge du coût selon la politique |
| PREPARING | READY | restaurant / cuisine `orders.mark_ready` | |
| READY | WAITING_FOR_COURIER | automatique, ou `orders.request_courier` | si aucun livreur n'est déjà affecté |
| READY, WAITING_FOR_COURIER | COURIER_ASSIGNED | ops `ops.dispatch.assign` ou acceptation d'une offre par un livreur | verrou : un seul livreur |
| COURIER_ASSIGNED | WAITING_FOR_COURIER | ops `ops.dispatch.reassign`, ou désistement du livreur | historique conservé, nouvelle tentative de livraison |
| COURIER_ASSIGNED | PICKED_UP | livreur affecté | arrivée au restaurant confirmée au préalable |
| PICKED_UP | IN_DELIVERY | livreur affecté | |
| IN_DELIVERY | DELIVERED | livreur affecté **avec OTP valide** | une seule validation ; déclenche les écritures financières |
| IN_DELIVERY | DELIVERY_FAILED | livreur + motif, confirmé par ops | ex. client injoignable après le délai d'attente |
| DELIVERY_FAILED | WAITING_FOR_COURIER | ops | nouvelle tentative |
| DELIVERY_FAILED, REJECTED, CANCELLED | REFUND_PENDING | système ou ops | uniquement si un paiement électronique a réussi |
| REFUND_PENDING | REFUNDED | finance `finance.refunds.approve` | **après confirmation du prestataire** |

Points importants :
- Un livreur peut être affecté **pendant la préparation** pour gagner du temps. L'affectation est alors enregistrée sur la livraison (`deliveries`). Quand la commande passe à READY, elle va directement à COURIER_ASSIGNED.
- Toute autre transition est refusée (`422 INVALID_TRANSITION`). Un restaurant ne peut jamais marquer une commande comme livrée.
- Chaque transition écrit une ligne dans `order_status_history` (ancien statut, nouveau, auteur, rôle, date, commentaire). Elle publie aussi un événement de domaine, qui déclenche les notifications et le temps réel.
- Un litige après livraison crée un **remboursement partiel** (`refunds`) sans changer le statut DELIVERED.

## 4.3 Livraison et dispatch (MVP : affectation manuelle assistée)
- L'écran opérations liste les commandes sans livreur, triées par urgence (heure de « prête » estimée).
- Pour chaque commande, il affiche :
  - les zones de départ et d'arrivée ;
  - la distance, si les coordonnées existent (sinon « distance inconnue », jamais estimée au hasard) ;
  - les livreurs en ligne de la zone, avec leurs espèces détenues et leur charge en cours.
- Deux modes :
  - **affectation directe** par l'opérateur ;
  - **offre** envoyée à un ou plusieurs livreurs, avec expiration. Le premier qui accepte l'obtient grâce à un verrou en base ; les autres voient « Course déjà attribuée ».
- Un livreur dont les espèces détenues dépassent son plafond n'est plus proposé tant qu'il n'a pas reversé l'argent.
- Étapes côté livreur : en route → arrivé au restaurant → retrait confirmé → en route vers le client → arrivé → saisie de l'OTP → livré.

## 4.4 Délais et alertes (valeurs dans `platform_settings`)
| Événement | Comportement |
|---|---|
| Restaurant sans réponse après N minutes | Alerte aux opérations + rappel sonore ; annulation automatique après M minutes si l'option est activée |
| Commande READY sans livreur après N minutes | Alerte aux opérations (scénario 3) ; la commande reste dans un état cohérent |
| Préparation dépassant le temps annoncé | Le cuisinier peut « signaler un retard » ; le client est informé |
| Livreur immobile ou injoignable | Incident ouvert par ops, réattribution possible |

## 4.5 Cas particuliers (§22)

| Situation | Réponse du système |
|---|---|
| Restaurant fermé pendant la commande | Refus à l'étape 2 avec un message clair ; le panier est conservé |
| Plat devenu indisponible | `409 ITEM_UNAVAILABLE` avec la liste des articles ; le client les retire |
| Prix modifié | `409 PRICE_CHANGED` avec le nouveau détail ; reconfirmation obligatoire |
| Adresse hors zone | Message « Ce restaurant ne livre pas encore à [quartier] » ; proposition d'autres restaurants |
| Double clic ou commande dupliquée | Clé d'idempotence : la même commande est renvoyée ; bouton désactivé pendant l'envoi |
| Perte de connexion | Resynchronisation au retour ; l'état affiché vient toujours du serveur |
| Paiement refusé ou expiré | Commande annulée (jamais transmise au restaurant) ; possibilité de réessayer ou de passer en espèces |
| Paiement confirmé tardivement (après expiration) | Le paiement est enregistré et un remboursement automatique est créé pour revue financière ; incident ouvert |
| Notification non envoyée | Nouvelles tentatives avec délai croissant ; échec final journalisé et visible par l'admin ; la notification dans l'application reste disponible |
| Client injoignable | Délai d'attente configurable, appels tracés, puis DELIVERY_FAILED et incident |
| Annulation pendant la préparation | Réservée aux opérations ; la politique définit qui supporte le coût (écritures spécifiques) |
| Compte suspendu | Sessions révoquées ; actions refusées avec un message explicite |
