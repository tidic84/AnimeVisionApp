# Téléchargements hors ligne

Disponibles sur Android uniquement ; sur le web, `startDownload` refuse avec un message.

## Un seul chemin

```
AnimeDetailScreen ── startDownload(episode, qualité, onProgress)
                       │  nettoie les orphelins, ignore un doublon non échoué
                       ▼
                     file d'attente (1 transfert à la fois, en mémoire)
                       ▼
                     executeDownload
                       ├─ VideoUrlExtractor.extractHLSForEpisode(id)
                       │    relit les serveurs de l'épisode sur l'API, cherche un .m3u8
                       │    dans la page de chaque lecteur (direct, puis via proxys)
                       ├─ garde la première URL HLS ; un MP4 seul fait échouer
                       └─ hlsDownloader.downloadHLS
                            playlist maître → variante au plus haut débit,
                            segments par lots de 5 (5 essais, 30 s max chacun),
                            échec sous 85 % de segments, refus au-delà de ~700 Mo estimés
```

`DownloadsScreen` et `SettingsScreen` ne font que lire (`getAllDownloads`,
`getStorageInfo`) ou supprimer (`cancelDownload` pour un item en attente,
`deleteDownload` sinon). Un transfert en cours ne peut pas être interrompu :
le moteur HLS n’a pas de poignée d’annulation. Le lecteur reçoit seulement `filePath`.

La lecture en ligne n'utilise pas `VideoUrlExtractor` : elle passe par `streamHosts.ts`.

## Ce qui est écrit sur le disque

- `downloads.json` (dossier documents) : la carte des téléchargements, clé
  `download_<id épisode>_<qualité>`. La qualité ne sert qu'à l'identifiant : le flux
  HLS est toujours pris à son meilleur débit.
- `downloads/<titre>_<id>.m3u8` : playlist locale, avec ses segments
  `<titre>_<id>_<n>.ts` à côté.
- `filePath` vaut `downloads/<titre>_<id>.ts`. Ce fichier n'existe pas : le lecteur,
  le nettoyage des orphelins, la taille et la suppression utilisent la playlist `.m3u8`
  correspondante (`playableFile`).

Les téléchargements faits avant ce format s'appellent `downloads/<titre>.m3u8` et
partagent des segments `segment_<lot>_<n>.ts`. Ils restent reconnus et lisibles ; à la
suppression, un fichier encore cité par un autre téléchargement est conservé.

## États

`QUEUED` → `DOWNLOADING` → `DOWNLOADED` ou `FAILED`. La progression envoyée à
`onProgress` passe par `downloading`, puis `completed` ou `error`. Au redémarrage de
l'app, un item resté `QUEUED` ou `DOWNLOADING` passe en `FAILED` : il peut être relancé
ou supprimé.

## Tests

`tests/test-download-flow.cjs`, `test-download-management.cjs`,
`test-hls-downloader.cjs` et `test-video-url-extractor.cjs` exécutent le vrai code
avec un système de fichiers et un réseau simulés.
