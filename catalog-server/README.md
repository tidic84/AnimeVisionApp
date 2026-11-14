# Catalogue Scan-Manga pour AnimeVision

Service séparé de l’API des animés. Node.js **22.19 ou supérieur**, Chromium standard via Playwright, SQLite local. Aucun CAPTCHA n’est résolu automatiquement.

## Windows intégré

La version Windows démarre le service dans le processus principal Electron et utilise une session Chromium séparée, avec sandbox et isolation du contexte. Les pop-ups, téléchargements et permissions du site sont refusés. Les vérifications éventuelles restent manuelles. Il n’est pas nécessaire de lancer Chrome ou de saisir une adresse : l’app utilise automatiquement `http://127.0.0.1:4318`. La synchronisation s’exécute toutes les 30 minutes tant qu’AnimeVision est ouvert.

Le classement public et les nouvelles œuvres enrichissent une base persistante dans le dossier utilisateur d’AnimeVision (`scan-catalog`). Un serveur Node séparé reste possible pour Android ou un déploiement distant, avec ses propres contraintes d’accès au site.

## Démarrage du serveur séparé

Sur ce PC, les dépendances sont déjà installées. `Demarrer-Scan-Manga.cmd` lance maintenant AnimeVision Windows avec son catalogue intégré. Les commandes ci-dessous concernent uniquement le serveur séparé.

```powershell
cd catalog-server
npm ci
npx playwright install chromium
npm run catalog
npm start
```

L’adresse locale est `http://127.0.0.1:4318`. Dans AnimeVision : **Scans → Scan-Manga → Configurer**, saisir cette adresse puis **Tester et enregistrer**. Sur Android, `127.0.0.1` désigne le téléphone : utiliser l’adresse du serveur accessible depuis le téléphone.

Le service est lié à la boucle locale par défaut. Pour un hébergement, définir `COMICS_HOST`, protéger le service derrière un reverse proxy HTTPS et ne publier que les routes de lecture `/api/comics/scanmanga/`. Aucun endpoint public ne déclenche une importation arbitraire ni n’accepte une URL à charger.

## Vérification demandée par Scan-Manga

Si une session validée est refusée au redémarrage du navigateur, utiliser `npm run interactive`. Ce mode garde le même navigateur et le même onglet pour l’import, les mises à jour et la préparation des chapitres. Il attend jusqu’à dix minutes une vérification manuelle et ne la résout jamais automatiquement. Ne pas fermer Chrome une fois la liste des œuvres visible ; arrêter le service avec Ctrl+C lorsque vous avez terminé.

Si la synchronisation signale une vérification : arrêter le service, lancer `npm run browser`, effectuer soi-même la vérification dans la fenêtre ouverte puis fermer cette fenêtre. Le navigateur conserve sa session dans `data/browser`. Relancer `npm run catalog`, puis `npm start`. Le profil de navigateur ne peut pas être utilisé par deux processus simultanément. Une session validée n’est pas une garantie d’accès permanent.

## Ce qui est indexé

- `npm run catalog` initialise le classement public **Top BD** et les dernières publications. Les vrais liens de pagination sont suivis lorsqu’ils existent ; les ancres de classement ne créent pas de faux appels.
- `npm start` récupère les dernières publications toutes les 30 minutes et ajoute les nouvelles œuvres. Les dates de publication du flux sont conservées ; les anciens chapitres découverts dans le lecteur ne sont pas annoncés comme des nouveautés.
- Ce périmètre n’est **pas le catalogue complet** de Scan-Manga. La recherche porte sur les œuvres importées. L’application affiche explicitement cette limite.
- Les romans et les œuvres explicitement marquées Adulte/Smut/Hentai sont exclus, conformément au périmètre déjà utilisé par l’application.
- Les identifiants `scanmanga:<id>` restent stables malgré les variantes d’URL et n’entrent pas en collision avec MangaDex.
- Les erreurs de réseau, vérifications et changements de format n’effacent pas la base. La date de dernière réussite et les erreurs sont exposées à l’application.

## Lecture

La liste des chapitres provient du sélecteur du lecteur public. Les pages sont préparées à la demande dans le navigateur du service, puis fournies au lecteur natif d’AnimeVision. Les images ne sont disponibles qu’après le chargement réussi de l’intégralité du chapitre. Les favoris et positions restent dans la base locale de l’application.

Les pages rendues sont mises en cache six heures avant nouvelle récupération ; le dossier `data/pages` contient les fichiers de cache. Une source inaccessible produit un message d’erreur, jamais des pages inventées. L’accès au catalogue, à une liste de 54 chapitres et aux 31 images d’un chapitre réel a été validé avec le transport Windows Electron. Le serveur Node/Chrome séparé reste susceptible d’être bloqué par une vérification.

## Configuration

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `COMICS_HOST` | `127.0.0.1` | Interface d’écoute |
| `COMICS_PORT` | `4318` | Port HTTP |
| `COMICS_DATA_DIR` | `catalog-server/data` | Base et profil du navigateur |
| `COMICS_SYNC_MINUTES` | `30` | Intervalle, minimum 15 minutes |
| `COMICS_AUTO_SYNC` | `true` | `false` désactive le collecteur automatique |
| `COMICS_BROWSER_CHANNEL` | Chrome installé sur Windows, sinon Chromium Playwright | Canal Chromium installé, par exemple `chrome` |
| `COMICS_HEADLESS` | `true` | Navigateur sans fenêtre |
| `COMICS_ORIGINS` | app Electron et localhost Expo | Origines web autorisées, séparées par virgules |

Le service ne lit pas automatiquement un fichier `.env` : définir les variables dans l’environnement du processus.

## Contrat HTTP

Préfixe : `/api/comics/scanmanga`.

- `GET /status` : état et dernière synchronisation.
- `GET /catalog?kind=manhwa&language=fr&q=...&order=latest&offset=0&limit=24` : recherche paginée ; `tag` répétable et `status` facultatif.
- `GET /tags`, `GET /updates?limit=18`.
- `GET /comics/:id`, `GET /comics/:id/chapters`.
- `GET /chapters/:id/pages` : HTTP 202 pendant la préparation, puis `{ pages: [{ url }] }` ; les URL de média sont relatives au serveur.
- `GET /media/:chapterId/:index` : image du chapitre préparé.

## Tests

`npm test` couvre les formes HTML observées, les identifiants, les dates, la pagination, la conservation des données, la synchronisation et le contrat HTTP. Les tests automatisés utilisent des fixtures minimales et ne constituent pas une validation de l’accès actuel au site.
