# Boutik Bénin

Boutique généraliste en ligne pour le marché béninois. Le projet utilise React/Vite, une API Hono, Neon PostgreSQL et Netlify Functions. Le cahier des charges v1.3 reste la référence fonctionnelle.

## Prérequis

- Node.js 22 ou plus récent
- pnpm 10.32.1
- Une base Neon de développement pour utiliser les fonctions métier réelles

## Installation

```sh
pnpm install --frozen-lockfile
```

Copier `.env.example` vers `.env`, puis renseigner `DATABASE_URL` avec la chaîne Neon. Le dépôt utilise le driver Neon WebSocket sur HTTPS pour les requêtes et les migrations; le port PostgreSQL direct peut être filtré par certains réseaux.

## Développement local

Lancer l’API et le frontend dans deux terminaux :

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/boutik-benin run dev
```

L’API écoute sur `http://127.0.0.1:8080` et Vite sur `http://localhost:5173`. Vite transmet `/api` à l’API.

Pour initialiser ou mettre à jour une base de développement :

```sh
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/api-server run seed:demo
pnpm --filter @workspace/api-server run seed:geography
```

Les seeds sont réexécutables. Ils sont réservés au développement et refusés lorsque `NODE_ENV=production`.

## Contrôles

```sh
pnpm run typecheck
pnpm run build
```

## Structure

- `artifacts/boutik-benin/` — boutique React/Vite
- `artifacts/api-server/` — API Hono locale et fonctions métier
- `lib/api-spec/`, `lib/api-client-react/`, `lib/api-zod/` — contrat API et clients générés
- `lib/db/` — schéma Drizzle, migration et accès Neon
- `netlify/` — fonction API Netlify
- `attached_assets/` — documents de référence du projet
- `PROJECT_STATUS.md` et `PLAN_DEVELOPPEMENT.md` — état réel et prochaines phases

Ne pas utiliser de données de démonstration comme données commerciales. Le paiement simulé ne doit pas être activé en production.
