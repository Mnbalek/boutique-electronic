# ADR 001 — Architecture du backend

- **Statut :** retenue pour la suite du projet
- **Date :** 16 novembre 2026

## Contexte

Le cahier des charges v1.3 fixe React/Vite côté web, une API REST TypeScript exécutée sur Netlify Functions, Hono pour le routage, Neon PostgreSQL et Drizzle ORM. Le dépôt provenait d’un environnement Replit et contient encore un scaffold Express qui ne sert que `/api/healthz`.

## Décision

Le backend métier suivra la stack du cahier : **Netlify Functions + Hono + Neon PostgreSQL + Drizzle**. L’API reste sous `/api` et le contrat OpenAPI existant reste la référence des routes publiques et client. Les opérations critiques (idempotence, paiement, stock) seront conçues en tenant compte des limites serverless et des garanties transactionnelles demandées.

Le serveur Express est un scaffold transitoire; il ne sera pas étendu aux parcours métier. La migration de `/api/healthz` vers la fonction Netlify fera partie des fondations de l’API.

## Conséquences

- Développement, prévisualisation et production utiliseront des environnements distincts et des branches Neon séparées.
- Les secrets resteront côté serveur et seront fournis par l’environnement de déploiement; aucun secret ne sera ajouté au dépôt.
- Le client PostgreSQL devra prendre en charge les transactions ou requêtes atomiques requises pour le stock et les paiements.
- Les migrations seront versionnées et appliquées de façon contrôlée; `drizzle-kit push` ne sera pas le mécanisme de déploiement de production.
- Une fonction planifiée traitera les commandes expirées et les purges prévues au cahier.
- Les webhooks de paiement seront vérifiés côté serveur; le retour navigateur ne sera jamais considéré comme preuve de paiement.
- Les déploiements réels et la configuration de services externes restent soumis aux accès et secrets fournis par le propriétaire.

## Hors périmètre de cette décision

Cette décision ne crée ni projet Netlify, ni base Neon, ni compte prestataire. Elle fixe le choix technique pour l’implémentation locale et les futurs déploiements.
