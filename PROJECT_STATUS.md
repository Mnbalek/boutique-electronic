# État du projet — cahier des charges v1.2

État établi le 16 novembre 2026 à partir du code et de l’aperçu de développement.

## Déjà en place

- Workspace pnpm avec application React/Vite, client API React généré, schémas Zod générés et service Express.
- Contrat OpenAPI public/client couvrant le catalogue et plusieurs parcours client.
- Interface française avec accueil, catalogue, fiche produit, connexion/inscription, panier invité, commande, compte, commandes, notifications et pages d’information. Ces écrans ne signifient pas que leurs opérations serveur fonctionnent.
- Jetons visuels vert/ambre, typographies, composants partagés et états de chargement/erreur.
- Jeu d’exemples : 48 produits, 6 catégories principales et 12 sous-catégories.
- Les dépendances manquantes à l’import ont été restaurées; le contrôle TypeScript complet passe.

## Corrigé pendant cette reprise

- Les workflows ne démarraient pas, car aucun `node_modules` n’était installé. `pnpm install --frozen-lockfile` a rétabli les dépendances.
- L’accueil et le catalogue restaient en chargement : leurs requêtes pointaient vers des routes API absentes. En développement seulement, les lectures publiques sont maintenant simulées à partir du jeu d’exemples; cela permet de revoir l’interface sans faire croire qu’une vraie boutique existe.
- Le catalogue demandait 12 articles par page au lieu des 24 prévus par le cahier des charges.
- Les filtres lisaient les paramètres de recherche depuis le chemin Wouter au lieu de la chaîne de requête. La recherche « eclat » fonctionne maintenant avec le nom accentué « Éclat »; les sélections de nouveautés et de popularité ne répètent plus la même série de produits.
- Les couleurs de premier plan des boutons DaisyUI n’étaient pas définies par le thème personnalisé; le texte des actions principales a maintenant un contraste adapté.
- La page HTML utilisait `lang="en"`, bloquait le zoom mobile et contenait encore une description générique de Replit. Ces valeurs ont été corrigées; l’indexation reste désactivée pendant la démonstration.

## Blocages importants

- Le serveur API ne répond qu’à `/api/healthz`. Les connexions, paniers connectés, adresses, commandes, paiements, notifications et toutes les opérations d’administration sont absents ou simulés nulle part.
- Le schéma Drizzle est vide; aucune migration, connexion PostgreSQL ni donnée initialisée n’existe. Les écrans connectés ne peuvent donc pas être considérés comme utilisables.
- Aucune interface ou route `/admin/*` n’est présente.
- Le panier invité lit une fiche produit par identifiant alors que la route publique attend un slug; il faut corriger le format stocké avant de valider ce parcours.
- Le cahier demande un backend Netlify Functions/Hono; le workspace contient un serveur Express. Ne pas remplacer l’architecture sans arbitrage explicite, mais clarifier cette différence avant la mise en production.
- Kkiapay, le fournisseur d’e-mails et Cloudinary ne sont pas configurés. Aucun paiement, email ni téléversement réel n’est disponible.

## À faire, par ordre de priorité

1. Faire valider l’aperçu visuel de la phase actuelle.
2. Construire la persistance PostgreSQL, les migrations et les données initiales, puis réaliser le parcours catalogue réel.
3. Ajouter comptes, sessions, adresses et panier persistant avec les règles de sécurité du cahier.
4. Implémenter commande, réservation atomique du stock, promotions, livraison, paiement Sandbox vérifié et idempotence.
5. Ajouter l’administration, les notifications, les remboursements simulés, l’audit et les contenus d’accueil administrables.
6. Compléter les critères de recette RC01–RC46, les tests, le SEO, l’accessibilité, les performances et la documentation d’exploitation.

## Informations à confirmer avant une exploitation réelle

- Base de données Neon et environnements de test/préproduction.
- Choix d’hébergement/API (Replit/Express ou Netlify/Hono) et modalités de déploiement.
- Documentation et clés de test Kkiapay; fournisseur email et Cloudinary.
- Tarifs et zones de livraison, conditions commerciales, mentions légales et propriétaire de la boutique.
