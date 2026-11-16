# Boutik Bénin

Boutique généraliste en ligne destinée au marché béninois, avec une interface publique, un espace client et une administration centralisée.

Le cahier des charges v1.2 fourni est la source de vérité produit. Construire une phase à la fois et attendre la validation de l’utilisateur avant de commencer la suivante.

## Run & Operate

- `pnpm install --frozen-lockfile` — restaurer les dépendances du workspace après import
- `pnpm --filter @workspace/boutik-benin run typecheck` — vérifier le frontend de la boutique
- `pnpm run typecheck` — vérifier tous les packages du workspace
- Le workflow `artifacts/boutik-benin: web` sert le frontend actuel.
- Pour le lancer dans le workflow Replit : `pnpm --filter @workspace/boutik-benin run dev`.
- En développement seulement, MSW fournit les lectures de démonstration de l’accueil et du catalogue depuis `src/demo/catalog.ts`. Ces données ne sont ni commerciales ni persistées.
- `artifacts/api-server` expose actuellement uniquement `/api/healthz` ; les opérations boutique, client, commande et administration ne sont pas implémentées côté serveur.
- La phase en cours reste la validation visuelle. Ne pas présenter la démonstration locale comme une boutique fonctionnelle ni commencer la phase suivante sans validation de l’utilisateur.

## Stack

- Frontend : React + Vite + TypeScript, Tailwind CSS + thème DaisyUI personnalisé, Lucide React
- Backend prévu par la v1.2 : Netlify Functions + Hono, Neon PostgreSQL, Drizzle ORM et schémas Zod partagés
- Ne pas remplacer les exigences v1.2 par Replit Database, un autre kit d’interface ou une autre stack backend.
- Utiliser le workspace pnpm existant et ses workflows d’artefacts.

## Where things live

- `artifacts/boutik-benin/` — application web et aperçu du système de design
- `artifacts/api-server/` — service fourni par le workspace, non utilisé par l’implémentation actuelle
- `artifacts/boutik-benin/src/index.css` — thème et styles globaux de la boutique

## Architecture decisions

- La boutique est généraliste, destinée au Bénin et exploitée par un seul administrateur.
- « Boutik Bénin » est un nom provisoire et doit rester configurable, comme prévu par la v1.2.
- Les produits et commandes de démonstration sont des exemples d’interface, pas des données commerciales réelles.
- Le serveur API du workspace est pour l’instant le scaffold Express fourni par Replit ; le cahier v1.2 décrit Netlify Functions/Hono. Ce choix d’hébergement et d’adaptation reste à clarifier avant la mise en production.

## Product

- Phase 1 : valider le système visuel et les composants réutilisables.
- Les phases suivantes doivent respecter les routes, règles métier, contrats API et critères de recette de la v1.2.

## User preferences

- La v1.2 est la seule source de vérité ; ne pas réduire silencieusement le périmètre ni inventer de règles manquantes.
- Réaliser une phase à la fois et attendre la validation de l’utilisateur avant la suivante.
- Interface uniquement en français, vouvoiement, montants entiers en FCFA, dates en Africa/Porto-Novo.
- Garder les données de démonstration séparées des données de l’application.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
