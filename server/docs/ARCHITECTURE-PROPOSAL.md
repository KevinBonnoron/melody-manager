# Proposition d’architecture : recherche, lecture, métadonnées

## État actuel (résumé)

| Élément | Rôle | Problème |
|--------|------|----------|
| **metadata.service** | Extraction métadonnées depuis un **fichier** (music-metadata) | Nom proche de metadata-source, rôle “fichier” pas évident |
| **metadata-source.service** | Agrège plusieurs **MetadataSource** (Spotify, MusicBrainz, etc.) et fusionne | Bon concept, nom prête à confusion avec metadata.service |
| **TrackSource** (sources/) | Recherche + import depuis URL + utilisation des metadata sources | Interface “god” : trop de responsabilités dans une seule abstraction |
| **StreamHandler** (stream-handlers/) | Un handler par provider pour le stream | Bien séparé, mais **track.service** fait un gros `if (provider.type === …)` pour les appeler |
| **search.service** | Appelle trackSourceService.search* puis ajoute library status | Déjà un orchestrateur de recherche, mais dépend de TrackSource |
| **track-source.service** | Détecte le provider, délègue au bon TrackSource | Mélange “recherche” et “import” sous le même service |

En résumé : deux services “metadata” aux noms proches, une interface TrackSource qui porte à la fois la recherche et l’import, et du dispatch manuel (switch) pour le streaming.

---

## Architecture cible : 3 piliers + métadonnées

L’idée est d’avoir **un service de recherche**, **un service de lecture (stream)** et **un service d’import**, puis d’**externaliser** les implémentations par provider (recherche, stream, métadonnées) dans des “providers” dédiés.

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                      ROUTES (API)                        │
                    └─────────────────────────────────────────────────────────┘
                                          │
         ┌────────────────────────────────┼────────────────────────────────┐
         │                                │                                │
         ▼                                ▼                                ▼
┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐
│  SearchService  │            │  StreamService  │            │ track-source    │
│  (orchestrateur)│            │  (orchestrateur)│            │ (recherche +    │
│                 │            │                 │            │  import)        │
└────────┬────────┘            └────────┬────────┘            └────────┬────────┘
         │                              │                              │
         │  utilise                     │  utilise                     │  utilise
         ▼                              ▼                              ▼
┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐
│ SearchProvider  │            │ StreamProvider   │            │ ImportProvider   │
│ (interface)     │            │ (interface)      │            │ (interface)      │
│                 │            │                 │            │                 │
│ Un plugin par   │            │ Un plugin par   │            │ Un plugin par    │
│ plateforme peut │            │ plateforme peut │            │ plateforme peut  │
│ implémenter     │            │ implémenter     │            │ implémenter      │
│ cette interface │            │ cette interface │            │ cette interface  │
└────────┬────────┘            └────────┬────────┘            └────────┬────────┘
         │                              │                              │
         └──────────────────────────────┼──────────────────────────────┘
                                       │
                          Registre : MelodyPlugin (id, name, search?, stream?, import?)
                          Un fichier par plateforme (ex. youtube.plugin.ts) implémente
                          une ou plusieurs de ces interfaces.
         │
         │  Les ImportProvider peuvent utiliser pour enrichir les tracks :
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MÉTADONNÉES                                        │
│  ┌───────────────────────┐    ┌───────────────────────┐                      │
│  │ MetadataExtractor    │    │ MetadataAggregator    │                      │
│  │ (fichier local only) │    │ (ex metadata-source   │                      │
│  │ music-metadata       │    │  .service)            │                      │
│  └───────────────────────┘    └───────────┬───────────┘                      │
│                                           │ utilise N ×                      │
│                                           ▼                                  │
│                                ┌───────────────────────┐                     │
│                                │ MetadataSource        │                     │
│                                │ (Spotify, MusicBrainz, │                     │
│                                │  Local, YouTube…)     │                     │
│                                └───────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Search (recherche)

- **SearchService** (existant, à conserver)  
  - Point d’entrée unique : `search(query, type)`, `searchTracks`, `searchAlbums`, etc.  
  - Récupère les providers actifs, appelle les **SearchProvider** concernés, agrège, ajoute le library status.

- **SearchProvider** (nouvelle interface, à extraire de TrackSource)  
  - Un provider par plateforme (YouTube, Spotify, Local, SoundCloud, Bandcamp).  
  - Méthodes : `searchTracks(query, provider)`, `searchAlbums?`, `searchArtists?`, `searchPlaylists?`.  
  - Les implémentations actuelles de “search” dans les sources deviennent des **SearchProvider** dédiés (ou une classe par source qui implémente à la fois SearchProvider et ImportProvider si tu veux garder un fichier par plateforme).

- **Enregistrement** : un registre `Record<TrackProviderType, SearchProvider>` (ou liste de SearchProvider avec `providerType`), injecté ou construit au démarrage.  
  SearchService s’appuie sur ce registre au lieu d’appeler `trackSourceService.search*`.

Bénéfice : la “recherche” ne dépend plus de l’import ni des métadonnées ; on peut faire évoluer ou tester la recherche indépendamment.

---

## 2. Playback / Stream (lecture)

- **StreamService** (nouveau, ou extraire la logique de `track.service`)  
  - Une seule méthode publique du type : `stream(c, trackId, transcodeFormat?)`.  
  - Récupère le track (et son provider), puis **délègue au bon StreamHandler via un registre**, sans gros `if (provider.type === …)`.

- **Registre de StreamHandlers**  
  - `Map<TrackProviderType, StreamHandler>` (ou objet `Record<…>`) rempli au démarrage avec les handlers existants (YouTube, Spotify, Local, SoundCloud, Bandcamp).  
  - StreamService fait : `const handler = streamHandlerRegistry[provider.type]; return handler(c, options);`

- **StreamHandler** (interface actuelle conservée)  
  - Signature inchangée : `(c, options) => Promise<Response>`.  
  - Chaque implémentation reste dans `stream-handlers/`.

Bénéfice : ajouter un nouveau provider = ajouter une entrée au registre et un fichier handler ; plus de modification en chaîne dans `track.service`.

---

## 3. Import (résolution d’URL → tracks)

- **ImportService** (ex-“track-source.service” recentré)  
  - Méthodes : `addFromUrl(url)`, `addAlbumFromUrl`, `addPlaylistFromUrl`, `addArtistFromUrl`.  
  - Détecte le provider à partir de l’URL, récupère le provider config, appelle l’**ImportProvider** correspondant.  
  - Ne fait **pas** de recherche : la recherche est gérée par SearchService + SearchProvider.

- **ImportProvider** (interface dérivée / simplifiée de TrackSource)  
  - Une implémentation par plateforme.  
  - Méthodes : `getTracks(url, provider)`, `getAlbumTracks?(url, provider)`, `getPlaylistTracks?`, `getArtistTracks?`.  
  - À l’intérieur, un ImportProvider peut utiliser **MetadataAggregator** + **MetadataSource** pour enrichir les tracks (comme aujourd’hui dans les sources).

- **Registre** : `Record<TrackProviderType, ImportProvider>`.  
  - Les actuelles “sources” (YouTube, Local, Spotify, etc.) deviennent des ImportProvider ; la partie “search” est déplacée vers SearchProvider.

Bénéfice : “importer depuis une URL” est une capacité claire et séparée de “rechercher” et de “streamer”.

---

## 4. Métadonnées (clarifier les noms et rôles)

- **MetadataExtractor** (ex-`metadata.service`)  
  - Rôle unique : extraire les métadonnées d’un **fichier** (ex. music-metadata).  
  - Renommer le fichier/service en `metadata-extractor.service.ts` ou `file-metadata.service.ts` pour éviter la confusion avec “metadata source”.

- **MetadataAggregator** (ex-`metadata-source.service`)  
  - Rôle : recevoir une `MetadataSearchQuery`, appeler N **MetadataSource** (tri par priorité), fusionner les résultats.  
  - Renommer en `metadata-aggregator.service.ts` (ou garder le nom actuel mais documenter clairement “agrégation de sources externes”).

- **MetadataSource** (inchangé)  
  - Interface conservée : `name`, `priority`, `getMetadata(query)`.  
  - Implémentations existantes : Spotify, MusicBrainz, Local, YouTube, SoundCloud, Bandcamp.  
  - Utilisé par MetadataAggregator et par les ImportProvider qui en ont besoin (ex. local, YouTube).

Bénéfice :  
- “metadata.service” = fichier ; “metadata-source.service” = agrégation de sources externes ; les noms (ou chemins) reflètent mieux les rôles.  
- On garde un modèle modulaire pour ajouter des sources (MusicBrainz, Spotify, etc.) sans toucher à l’orchestration.

---

## 5. Modèle plugin : un fichier par plateforme, interfaces distinctes

**Principe** : une seule interface **MelodyPlugin** par plateforme. Chaque plugin est un fichier (ex. `youtube.plugin.ts`) qui **implémente les interfaces dont il a besoin** : `SearchProvider`, `StreamProvider`, `ImportProvider`. Un plugin YouTube implémente les trois ; un plugin “local” peut n’implémenter que `ImportProvider` (pas de search externe).

- **Interfaces distinctes** : `SearchProvider`, `StreamProvider`, `ImportProvider` restent définies séparément. Le plugin les implémente et les expose via l’objet `MelodyPlugin` (`search?`, `stream?`, `import?`).
- **Un fichier par plateforme** : toute la logique YouTube (recherche, stream, import) vit dans `plugins/youtube.plugin.ts`. Idem pour Spotify, Local, etc.
- **Objectif à terme** : permettre d’**externaliser** chaque source dans des **plugins installables par l’utilisateur**, type **HACS (Home Assistant)** : dépôts de plugins, installation/en désinstallation, mise à jour, sans toucher au cœur de l’app.

Structure actuelle :

```
server/
├── src/plugins/
│   ├── types.ts                   # SearchProvider, StreamProvider, ImportProvider, MelodyPlugin
│   ├── manifest.type.ts           # PluginManifest, ConfigSchemaItem (id, name, entry, features, configSchema…)
│   ├── registry.ts                # pluginRegistry.register(), getCapabilities(), supportsSearchType(), …
│   ├── loader.ts                  # loadPlugins() : lit manifests, charge entry, instancie la classe, enregistre
│   └── index.ts                   # export du registre + loadPlugins
├── plugins/
│   └── youtube/
│       ├── package.json
│       ├── manifest.json          # id, name, description, entry, features, searchTypes, importTypes, configSchema (ex. splitChapters)
│       └── src/
│           └── index.ts           # export class YoutubePlugin (SearchProvider + ImportProvider + stream())
├── services/
│   ├── search.service.ts          # inchangé, appelle trackSourceService qui utilise le registre
│   ├── stream.service.ts          # délègue au StreamProvider du registre (sinon null → fallback legacy)
│   ├── track-source.service.ts    # recherche + import : préfère le registre, sinon TrackSource legacy
│   └── track.service.ts          # CRUD + stream via streamService puis fallback legacy
├── stream-handlers/               # handlers legacy (Bandcamp, Local, SoundCloud, Spotify) ; YouTube stream est dans plugins/youtube
├── metadata-sources/               # inchangé (MetadataSource)
└── sources/                       # legacy TrackSource, gardé pour transition (Spotify, Local, …)
```

Migration progressive : les providers déjà migrés en plugin (ex. YouTube) sont servis par le registre ; les autres continuent d’utiliser les anciennes `sources/` jusqu’à migration.

---

## 6. Ordre de migration suggéré

1. **Stream**  
   - Créer `StreamService` + registre de StreamHandlers.  
   - Faire appeler `streamService.stream()` depuis `track.service`.  
   - Supprimer le gros switch du track.service.

2. **Métadonnées**  
   - Renommer `metadata.service` → `metadata-extractor.service` (ou file-metadata).  
   - Renommer `metadata-source.service` → `metadata-aggregator.service`.  
   - Mettre à jour les imports (local.metadata-source, local.source, etc.).

3. **Search**  
   - Définir l’interface `SearchProvider` et le registre.  
   - Extraire la partie “search” des TrackSource vers des SearchProvider (ou des classes qui implémentent SearchProvider).  
   - Faire utiliser ce registre à SearchService au lieu de trackSourceService.search*.

4. **Import**  
   - Définir l’interface `ImportProvider` et le registre.  
   - Renommer / recentrer `track-source.service` en `import.service` et faire qu’il n’utilise que les ImportProvider (getTracks, getAlbumTracks, etc.).  
   - Les anciennes “sources” deviennent des ImportProvider (éventuellement dans `providers/import/`).

---

## 7. Résumé des interfaces

| Concept | Rôle | Méthodes clés |
|--------|------|----------------|
| **MelodyPlugin** | Un plugin par plateforme (un fichier) | `id`, `name`, `capabilities?`, `search?`, `stream?`, `import?` |
| **SearchProvider** | Recherche par plateforme | `search(query, type, provider)` — un switch interne par type |
| **PluginCapabilities** | Capacités déclarées du plugin | `search?: SearchType[]`, `stream?: boolean`, `import?: SearchType[]` |
| **StreamProvider** | Stream par plateforme | `(c, options) => Promise<Response>` |
| **ImportProvider** | Import par plateforme | `getTracks()`, `getAlbumTracks?()`, … |
| **SearchService** | Orchestrateur recherche | `search()`, `searchTracks()`, … (via trackSourceService + registre) |
| **StreamService** | Orchestrateur stream | `streamTrack(c, track, transcode?)` → registre puis fallback |
| **track-source.service** | Recherche + import | Préfère registre (SearchProvider / ImportProvider), sinon TrackSource legacy |
| **MetadataExtractor** | Métadonnées fichier | `extractMetadata(filePath)` |
| **MetadataAggregator** | Agrégation sources | `getMetadataWithSources(query, sources)` |
| **MetadataSource** | Une source externe | `getMetadata(query)` |

---

## 8. Vision : plugins externes type HACS

À terme, l’objectif est de permettre à l’utilisateur d’**installer des plugins** (sources) comme sur Home Assistant avec HACS :

- **Dépôt de plugins** : chaque source (YouTube, Spotify, Deezer, etc.) est un plugin versionné, installable/désinstallable.
- **Contrat** : un plugin exporte un `MelodyPlugin` (avec les interfaces qu’il implémente). Le core ne connaît que les interfaces `SearchProvider`, `StreamProvider`, `ImportProvider` et le registre.
- **Chargement** : au démarrage, le serveur charge les plugins “built-in” (dans le repo) puis, si on l’implémente, les plugins installés par l’utilisateur (dossier dédié ou paquets npm marqués `melody-manager-plugin`).
- **Isolation** : les plugins peuvent être sandboxés ou chargés en tant que dépendances optionnelles pour limiter la surface d’attaque et les conflits de versions.

L’architecture actuelle (interfaces distinctes + un fichier par plateforme + registre unique) est conçue pour que cette externalisation soit possible sans refonte majeure.

### Capabilities et futur manifeste JSON

Chaque plugin peut exposer un objet **`capabilities`** (`PluginCapabilities`) : types de recherche supportés (`search: ['track','album',…]`), stream ou non, types d’import supportés. Le registre expose `getCapabilities(id)` et `supportsSearchType(id, type)` pour que les services (search, stream, import) **sachent quels plugins appeler** pour quelle opération. À terme, un **fichier JSON par plugin** (ex. `youtube.capabilities.json`) pourra décrire ces capacités ; le chargement du plugin pourra merger ce JSON dans le `MelodyPlugin`, ou un service dédié lira les manifests pour filtrer les providers à appeler.
