# Boutik Bénin

Boutique généraliste en ligne destinée au marché béninois, avec une interface publique, un espace client et une administration centralisée.

Le cahier des charges v1.2 fourni est la source de vérité produit. Construire une phase à la fois et attendre la validation de l’utilisateur avant de commencer la suivante.

## Run & Operate

- `pnpm --filter @workspace/boutik-benin run typecheck` — vérifier le frontend de la boutique
- `pnpm run typecheck` — vérifier tous les packages du workspace
- Le workflow `artifacts/boutik-benin: web` sert le frontend actuel.
- La phase 1 est un aperçu du système de design uniquement ; aucun parcours boutique, API ou base de données n’est encore implémenté.

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
