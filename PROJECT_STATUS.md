# État du projet — audit du 16 novembre 2026

## Référence

Le cahier des charges v1.3 fourni par le propriétaire est la référence fonctionnelle actuelle. Il décrit une boutique pour le Bénin avec catalogue, comptes clients, panier, commandes, promotions, livraison, paiement Kkiapay Sandbox, administration et 46 scénarios de recette.

## État réel

- L’application React/Vite fournit une interface de démonstration en français et un catalogue fictif de 48 produits, 6 catégories principales et 12 sous-catégories.
- MSW simule certaines lectures publiques en développement. Ces réponses ne sont pas persistées et ne constituent pas un backend métier.
- Le contrat OpenAPI et les clients/types générés couvrent des opérations publiques et client. Hono expose health, catalogue, auth, géographie, panier, adresses, devis checkout, commandes client et devis de livraison; Netlify route `/api/*` vers la fonction Hono.
- Un schéma Drizzle initial de 29 tables couvre comptes/sessions, géographie, catalogue, commandes/paiements/stock, promotions, annulations/réclamations/remboursements, notifications, emails et audit. La migration initiale est appliquée sur Neon. Les types DB et API passent.
- Les routes catalogue appliquent filtres, tri, pagination, recherche sans accents et stock disponible après réservations actives. Un seed réexécutable a chargé 21 catégories et 48 produits de démonstration avec leur stock initial et leurs images.
- Les parcours inscription/connexion/session/logout, panier connecté et CRUD d’adresses ont été vérifiés sur Neon avec un compte temporaire ensuite supprimé.
- Le référentiel CC BY 4.0 des 12 départements et 77 communes et les 3 zones tarifaires initiales du cahier sont chargés. Les tarifs sont des valeurs de démonstration à confirmer avant exploitation commerciale.
- Le preview checkout calcule les totaux et promotions côté serveur. La création de commande est idempotente et transactionnelle : vérification prix/stock, verrouillage des produits, snapshot d’adresse/livraison, lignes, réservation, tentative de paiement initiale et historique. Test Neon réussi pour devis Cotonou (1 000 FCFA), création, répétition de même clé, garde d’une commande en attente et liste; les données temporaires ont été supprimées.
- Le démarrage refuse désormais `PAYMENT_MODE=mock` en production. La confirmation Kkiapay, les transitions de commande après paiement, tâche périodique d’expiration, notifications, anonymisation du compte, administration et reçu restent à implémenter. Aucun écran ni endpoint d’administration n’est présent.
- La connexion locale de développement utilise Hono sur 8080; Vite transmet `/api` vers ce serveur. En déploiement, Netlify route `/api/*` vers la fonction Hono.
- Le client DB Neon passe par WebSocket HTTPS (443), car le réseau laissait établir TLS sur le port PostgreSQL mais ne renvoyait pas de réponse SQL. Le driver officiel Neon fonctionne avec la configuration présente; `drizzle-kit migrate` est remplacé par le migrateur Drizzle via ce même transport.
- Le lockfile a été recalculé et `pnpm install --frozen-lockfile --ignore-scripts` a installé les dépendances. Le build global passe. L’API a retourné HTTP 200 pour health, départements (12), communes (77) et catégories (6); le panier sans session retourne 401.
- `VITE_USE_DEMO_API=false` désactive MSW. Le build global passe et le catalogue ainsi que les parcours client/checkout décrits ci-dessus ont été vérifiés.
- Aucun test automatisé de recette n’a été trouvé dans le dépôt lors de l’audit.

## Nettoyage du dépôt

Les fichiers de configuration et métadonnées spécifiques à Replit ont été retirés. Les configurations Vite disposent désormais de ports et chemins par défaut, et le dépôt inclut un guide de démarrage local ainsi qu’un plan par phases. L’historique Git, le code de prototype, les documents fournis et les éléments locaux déjà présents ont été conservés.

## Décisions déjà prises et points ouverts

1. Architecture retenue conformément au cahier : Netlify Functions + Hono 4 stable + Neon; décision documentée dans l’ADR-001.
2. La validation visuelle reste ouverte et prioritaire avant la présentation.
3. Neon est accessible via le transport WebSocket; les migrations et seeds utilisent ce canal. Confirmer les tarifs de démonstration avant production et poursuivre avec Kkiapay Sandbox.

## Suite recommandée

Suivre le plan de livraison par phases dans `PLAN_DEVELOPPEMENT.md`. Catalogue, compte client, panier, adresses, zones, preview checkout et création/réservation de commande sont écrits et vérifiés. La prochaine étape est Kkiapay Sandbox et la confirmation sécurisée côté serveur.

Ne pas présenter les données fictives comme des données commerciales et ne pas activer le mode de paiement simulé en production.
