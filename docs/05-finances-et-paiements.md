# 5. Finances et paiements

## 5.1 Principe : grand livre en partie double
- Chaque mouvement d'argent est une **transaction** composée d'écritures dont la somme des débits égale la somme des crédits.
- Les soldes (ce qui est dû à un restaurant ou à un livreur, les revenus de la plateforme) sont **calculés à partir des écritures**, jamais stockés comme des compteurs modifiables.
- Une erreur se corrige par une **écriture d'extourne** (une écriture inverse), avec un motif et un auteur. Aucune transaction n'est modifiée.

### Comptes
| Compte | Signification |
|---|---|
| `clearing:cash:{courierId}` | Espèces encaissées par un livreur, pas encore reversées |
| `clearing:provider:{provider}` | Argent Mobile Money détenu chez le prestataire |
| `payable:restaurant:{id}` | Montant dû au restaurant |
| `payable:courier:{id}` | Rémunération due au livreur |
| `revenue:commission` | Commissions de la plateforme |
| `revenue:delivery` | Marge sur la livraison (frais client − rémunération livreur) |
| `revenue:service` | Frais de service |
| `expense:platform_promotions` | Réductions financées par la plateforme (coupons) |
| `bank:platform` | Trésorerie de la plateforme |

## 5.2 Valeurs figées à la commande (aucune n'est écrite dans le code)
- `commission_rate_bps` : taux du **contrat en vigueur** du restaurant, en points de base (1 % = 100). Il est configuré par l'administration et versionné.
- `customer_fee` et `courier_pay` : issus de la **grille de frais de livraison** en vigueur entre les deux zones.
- `service_fee` : paramètre de la plateforme, éventuellement 0.
- Qui finance une réduction :
  - une promotion **du restaurant** réduit la base de sa commission ;
  - un coupon **de la plateforme** est une charge pour la plateforme. *Ce point est une règle commerciale à valider.*

### Formules (module `packages/domain/finance`, testé unitairement)
```
base_restaurant = items_subtotal − restaurant_discount
commission      = arrondi(base_restaurant × commission_rate_bps / 10 000)
restaurant_net  = base_restaurant − commission
total_client    = base_restaurant − platform_discount + delivery_fee + service_fee
marge_livraison = delivery_fee − courier_pay
```
Les exemples chiffrés du cahier des charges (ex. 10 000 FCFA) servent **uniquement aux tests**. Ils ne deviennent jamais des valeurs par défaut.

## 5.3 Écritures générées

**À la livraison d'une commande payée en espèces (DELIVERED)** : le livreur a encaissé `total_client`.
| Compte | Débit | Crédit |
|---|---:|---:|
| clearing:cash:{livreur} | total_client | |
| expense:platform_promotions | platform_discount | |
| payable:restaurant:{id} | | restaurant_net |
| revenue:commission | | commission |
| payable:courier:{livreur} | | courier_pay |
| revenue:delivery | | marge_livraison |
| revenue:service | | service_fee |

**Reversement des espèces par le livreur** : crédit de `clearing:cash:{livreur}`, débit de `bank:platform`. Il est souvent net de sa rémunération (`payable:courier` débité). Le reçu est édité et signé par l'agent qui reçoit l'argent.

**Mobile Money** : à la confirmation du paiement, la contrepartie est enregistrée en attente (`clearing:provider`). La répartition est faite à la livraison, comme ci-dessus.

**Remboursement** : écriture inverse, proportionnelle ou totale. Qui supporte le coût (restaurant, plateforme ou livreur) est déterminé par le motif et la politique d'annulation.

**Versement à un restaurant** : débit de `payable:restaurant:{id}`, crédit de `bank:platform`. Il passe par les étapes suivantes : préparé → approuvé (double validation) → exécuté avec référence → notifié.

## 5.4 Architecture de paiement
```ts
interface PaymentProvider {
  code: 'CASH' | 'MTN_MOMO' | 'MOOV_MONEY' | string;
  initiate(payment): Promise<{ providerRef; status: 'PENDING'; customerAction? }>;
  verifyWebhook(headers, rawBody): VerifiedEvent | null;   // signature HMAC / jeton
  fetchStatus(providerRef): Promise<'PENDING'|'SUCCEEDED'|'FAILED'|'EXPIRED'>;
  refund?(payment, amount): Promise<{ providerRef; status }>;
}
```
- **Espèces** : opérationnel dès le MVP. Le paiement passe à SUCCEEDED uniquement à la validation OTP de la livraison.
- **Mobile Money** : deux options possibles.
  - **Agrégateur béninois** (FedaPay ou KKiaPay) : une intégration couvre MTN et Moov ; obtention plus rapide.
  - **API directes** MTN MoMo et Moov : frais potentiellement plus bas, mais deux intégrations et deux démarches KYC.
  - Le choix dépend de vos accès marchands ; voir les décisions à prendre.
- Traitement d'un paiement électronique :
  1. création du paiement (PENDING) ;
  2. appel au prestataire ;
  3. **webhook vérifié** (signature + `provider_event_id` unique, qui absorbe les doubles notifications), puis contre-vérification par `fetchStatus` ;
  4. mise à jour du paiement ;
  5. notification au client ;
  6. **rapprochement quotidien** entre les relevés du prestataire et les paiements, avec génération d'incidents pour les écarts.
- Un paiement électronique n'est **jamais** marqué réussi sans confirmation vérifiée du prestataire. Les clés sont uniquement côté serveur.
- Tant que les identifiants ne sont pas fournis, le moyen de paiement est **masqué** dans l'interface. Il n'y a pas de faux bouton.

## 5.5 Rapports
- **Restaurant** : ventes brutes, réductions, commissions, net, déjà versé, en attente, historique des versements. Tout est calculé à partir des écritures.
- **Plateforme** : chiffre d'affaires brut (GMV), commissions, marge de livraison, frais de service, remboursements, espèces non reversées par livreur, sommes restant à verser.
- Exports PDF et Excel, filtrés par période et par restaurant, journalisés dans l'audit.
