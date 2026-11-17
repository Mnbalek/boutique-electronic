# Plan de développement — Boutik Bénin

## But

Livrer la boutique décrite dans le cahier des charges v1.3 sans confondre l’aperçu MSW avec une application métier. Chaque phase doit se terminer par des contrôles reproductibles, une mise à jour de `PROJECT_STATUS.md` et une revue du résultat avant d’engager la phase suivante.

## État de départ

- Interface de démonstration React/Vite et catalogue fictif présents.
- Contrat OpenAPI et clients générés présents.
- API Hono amorcée pour Netlify Functions et le développement local; health check et premières routes catalogue sont écrits.
- Schéma métier Drizzle et migration SQL initiale générés; contrôles TypeScript DB/API et build frontend passés. Health check API vérifié en HTTP. Routes catalogue et seed de démonstration écrits.
- Aucun parcours métier serveur, panneau d’administration ou test de recette trouvé.
- Les dépendances sont installées avec `pnpm install --frozen-lockfile --ignore-scripts`; le lockfile reflète les manifestes nettoyés. Le registre a dû être explicitement autorisé car pnpm était configuré hors ligne.

## Décision préalable

Le cahier v1.3 prescrit React/Vite, Netlify Functions avec Hono et Neon PostgreSQL. Cette stack est maintenant retenue dans `docs/decisions/ADR-001-backend-architecture.md`; le scaffold Express a été remplacé par une application Hono partagée par la fonction Netlify et le serveur local.

## Phases

### 0. Préparer le nouveau dépôt

- Créer le dépôt GitHub du propriétaire et y relier le dépôt local quand son URL sera disponible.
- Effectuer la première installation pnpm, recalculer le lockfile, puis confirmer les commandes de développement et de build sur l’environnement cible.
- Ajouter un fichier `.env.example` sans valeurs secrètes et configurer les secrets uniquement dans les environnements de déploiement.
- Ajouter une intégration continue qui installe depuis le lockfile, lance le contrôle TypeScript, le build et les tests au fur et à mesure de leur création.
- Revoir les fichiers non suivis et l’ancien `zipFile.zip` supprimé avant le premier commit GitHub; ne pas les ajouter ou restaurer à l’aveugle.

**Sortie attendue :** installation reproductible, dépôt GitHub relié par le propriétaire, build initial documenté et CI verte.

### 1. Fixer l’architecture et les environnements

- Écrire une décision d’architecture alignée sur la stack choisie.
- Définir développement, test, prévisualisation et production, avec bases Neon séparées.
- Créer la fonction API, les réponses d’erreur normalisées, la validation Zod et la gestion des variables d’environnement.
- Mettre en place migrations Drizzle contrôlées, journalisation sans secrets et politique CORS selon l’origine réelle.

**Sortie attendue :** squelette serveur déployable et connexion de test à la base, sans secrets dans Git.

### 2. Construire la persistance et les données initiales — en cours

- Modéliser les entités du cahier : comptes, sessions, adresses, catégories, produits, images, panier, commandes, réservations, paiements, notifications, promotions et audit.
- Ajouter contraintes, index, clés étrangères et règles de non-négativité prévues au cahier.
- Préparer migrations et jeux de données réinitialisables : géographie béninoise, compte administrateur initial et produits de démonstration.

**Avancement :** 29 tables écrites; migration initiale appliquée à Neon. Le seed catalogue réexécutable a chargé 21 catégories et 48 produits; le référentiel CC BY 4.0 a chargé 12 départements et 77 communes. Le réseau local bloque le protocole PostgreSQL classique; application, seeds et migrations passent désormais par le transport Neon WebSocket sur HTTPS. Compte administrateur initial et revue détaillée des contraintes restent à faire.

**Sortie attendue :** base reconstruisible depuis zéro et données de développement reproductibles.

### 3. Livrer le catalogue public réel — en cours

- Implémenter accueil, catégories, fiche produit, recherche insensible aux accents, filtres, tri et pagination de 24 articles par défaut.
- Servir ces données depuis l’API et retirer progressivement les mocks des routes devenues réelles.
- Ajouter les aperçus sociaux par fiche produit (OG) et les états de chargement, erreur, vide et succès.

**Avancement :** accueil, arbre de catégories, liste filtrable/paginée et détail produit lisent maintenant la base Neon. Le proxy Vite a retourné les 48 produits; MSW est désactivé localement.

**Recette associée :** critères catalogue BF01–BF06, BF41–BF42 et scénarios RC01–RC04, RC41.

### 4. Comptes, sessions, adresses et panier

- Inscription, connexion, déconnexion, récupération et réinitialisation du mot de passe.
- Sessions httpOnly, protections contre les tentatives répétées, contrôle de rôle et de compte actif.
- CRUD des adresses et anonymisation du compte.
- Panier local invité, panier connecté et fusion idempotente à la connexion; le visiteur devra se connecter avant de commander.

**Avancement :** endpoints inscription/connexion/session/logout, panier, adresses, géographie et devis de livraison écrits. Parcours réel vérifié sur Neon : inscription, lecture de session, panier, création/suppression d’adresse, reconnexion, déconnexion et révocation. Compte temporaire supprimé après le contrôle.

**Recette associée :** BF07–BF14, BF43–BF44 et RC05–RC11, RC39.

### 5. Livraison, promotions, commande et réservation de stock

- Calcul serveur des prix, remises, zones et frais de livraison.
- Prévisualisation du checkout et validation serveur des prix, disponibilités et promotions.
- Création de commande idempotente; réservation atomique du stock, verrouillage ordonné des produits, échéance et libération des réservations expirées.
- Historique des statuts, annulation et reçus imprimables.

**Recette associée :** règles RG31–RG53, RG67–RG73 et critères RC12–RC20, RC23–RC27, RC30–RC31.

**Avancement :** tarifs initiaux et rattachements de zones du cahier chargés (1 000 / 2 000 / 3 500 FCFA); preview checkout, promotions, idempotence, historique de commande et réservation transactionnelle ajoutés. Contrôle réel à Cotonou réussi : preview à 1 000 FCFA, création, répétition idempotente, garde commande en attente et liste client. Les commandes/réservations de vérification ont été supprimées. Confirmation Kkiapay, transitions post-paiement et tâche planifiée d’expiration restent à faire.

### 6. Paiements simulés et notifications — Kkiapay reporté

- Pour la démonstration actuelle, permettre à l’administrateur de simuler un succès ou un refus sans appeler de prestataire ni encaisser d’argent.
- Conserver l’idempotence, les transitions de commande, les mouvements de stock, les notifications internes et le journal d’audit associés à l’issue simulée.
- Reporter l’intégration Kkiapay Sandbox, les webhooks et la vérification fournisseur à une étape ultérieure, après validation du compte marchand.
- Ajouter notifications internes et envoi email configurable; exécuter le traitement périodique d’expiration et de purge.

**Recette associée :** BF18–BF28, BF45, BF48–BF49 et scénarios RC21–RC30, RC32.

**Décision du propriétaire :** Kkiapay est reporté. La simulation ne doit jamais être présentée comme un paiement réel.

### 7. Administration commerciale

- Protéger l’espace d’administration par rôle vérifié côté serveur.
- Gérer produits, catégories, images, prix, stocks et mouvements, commandes, clients, promotions, paiements simulés, remboursements, zones de livraison, bannières et paramètres.
- Ajouter tableau de bord, notifications de stock bas et journal d’audit immuable.

**Avancement :** première tranche livrée : espace protégé, indicateurs, liste des commandes, simulation succès/refus avec stock, historique, notification et audit; progression contrôlée de confirmed à delivered; ajustements manuels de stock avec motif et journalisation. La gestion complète des produits et catégories, images, clients, promotions, remboursements, zones, bannières et paramètres reste à réaliser.

**Recette associée :** BF29–BF40, BF50–BF55 et scénarios RC33–RC40, RC44–RC45.

### 8. Recette, sécurité et mise en production

- Automatiser les 46 scénarios RC01–RC46 et rattacher chaque BF/RG à au moins une recette.
- Vérifier les parcours complets sur mobile et bureau, l’accessibilité, les performances, le SEO et l’impression du reçu.
- Vérifier les contrôles de sécurité, les webhooks, la limitation de débit, les secrets, sauvegardes, migrations et procédures de reprise.
- Déployer d’abord en préproduction; ne publier en production qu’après validation explicite du propriétaire.

**Sortie attendue :** matrice de traçabilité et rapport de recette sans défaut bloquant ou majeur ouvert.

## Règles d’exécution

- Une phase à la fois; afficher les résultats et obtenir la validation du propriétaire aux jalons convenus.
- Ne jamais présenter les prix, stocks ou commandes fictifs comme réels.
- Toutes les valeurs commerciales faisant autorité sont recalculées côté serveur.
- Aucun secret, paiement réel ou déploiement en production sans configuration et autorisation appropriées.
