import * as SQLite from 'expo-sqlite';
import { Anime, Episode, AnimeList, WatchHistory, UserAnimeStatus, WatchStatus, DownloadStatus } from '../types/anime';

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  async initializeDatabase(): Promise<void> {
    try {
      this.db = await SQLite.openDatabaseAsync('animevision.db');
      await this.createTables();
      await this.createDefaultList();
    } catch (error) {
      console.error('Erreur lors de l\'initialisation de la base de données:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Base de données non initialisée');

    const queries = [
      // Table des animés
      `CREATE TABLE IF NOT EXISTS animes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        originalTitle TEXT,
        synopsis TEXT,
        genres TEXT,
        studio TEXT,
        year INTEGER,
        rating REAL,
        status TEXT,
        thumbnail TEXT,
        banner TEXT,
        episodeCount INTEGER,
        duration INTEGER,
        malId INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Table des épisodes
      `CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        animeId TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT,
        thumbnail TEXT,
        duration INTEGER,
        watchProgress INTEGER DEFAULT 0,
        isWatched BOOLEAN DEFAULT 0,
        downloadStatus TEXT DEFAULT 'not_downloaded',
        videoUrl TEXT,
        streamingUrls TEXT,
        skipIntro TEXT,
        skipOutro TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (animeId) REFERENCES animes (id)
      )`,

      // Table des listes
      `CREATE TABLE IF NOT EXISTS animeLists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        isDefault BOOLEAN DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Table de liaison liste-animé
      `CREATE TABLE IF NOT EXISTS listAnimes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listId TEXT NOT NULL,
        animeId TEXT NOT NULL,
        addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (listId) REFERENCES animeLists (id),
        FOREIGN KEY (animeId) REFERENCES animes (id),
        UNIQUE(listId, animeId)
      )`,

      // Table de l'historique de visionnage
      `CREATE TABLE IF NOT EXISTS watchHistory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        animeId TEXT NOT NULL,
        episodeId TEXT NOT NULL,
        lastWatchedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        progress INTEGER DEFAULT 0,
        FOREIGN KEY (animeId) REFERENCES animes (id),
        FOREIGN KEY (episodeId) REFERENCES episodes (id),
        UNIQUE(animeId, episodeId)
      )`,

      // Table du statut utilisateur des animés
      `CREATE TABLE IF NOT EXISTS userAnimeStatus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        animeId TEXT NOT NULL UNIQUE,
        status TEXT DEFAULT 'not_started',
        currentEpisode INTEGER DEFAULT 0,
        score INTEGER,
        startDate DATETIME,
        finishDate DATETIME,
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (animeId) REFERENCES animes (id)
      )`,

      // Table des paramètres
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const query of queries) {
      await this.db.execAsync(query);
    }
  }

  private async createDefaultList(): Promise<void> {
    if (!this.db) return;

    const existingList = await this.db.getFirstAsync(
      'SELECT id FROM animeLists WHERE isDefault = 1'
    );

    if (!existingList) {
      await this.db.runAsync(
        'INSERT INTO animeLists (id, name, isDefault) VALUES (?, ?, ?)',
        ['default-watchlist', 'À regarder', 1]
      );
    }
  }

  // CRUD pour les animés
  async saveAnime(anime: Anime): Promise<void> {
    if (!this.db) throw new Error('Base de données non initialisée');

    await this.db.runAsync(
      `INSERT OR REPLACE INTO animes 
       (id, title, originalTitle, synopsis, genres, studio, year, rating, status, 
        thumbnail, banner, episodeCount, duration, malId, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        anime.id,
        anime.title,
        anime.originalTitle || null,
        anime.synopsis,
        JSON.stringify(anime.genres),
        anime.studio,
        anime.year,
        anime.rating,
        anime.status,
        anime.thumbnail,
        anime.banner || null,
        anime.episodeCount,
        anime.duration,
        anime.malId || null,
      ]
    );
  }

  async getAnime(animeId: string): Promise<Anime | null> {
    if (!this.db) throw new Error('Base de données non initialisée');

    const result = await this.db.getFirstAsync(
      'SELECT * FROM animes WHERE id = ?',
      [animeId]
    ) as any;

    if (!result) return null;

    return {
      ...result,
      genres: JSON.parse(result.genres || '[]'),
    };
  }

  async getAllAnimes(): Promise<Anime[]> {
    if (!this.db) throw new Error('Base de données non initialisée');

    const results = await this.db.getAllAsync('SELECT * FROM animes') as any[];
    return results.map(result => ({
      ...result,
      genres: JSON.parse(result.genres || '[]'),
    }));
  }

  // CRUD pour les épisodes
  async saveEpisode(episode: Episode): Promise<void> {
    if (!this.db) throw new Error('Base de données non initialisée');

    await this.db.runAsync(
      `INSERT OR REPLACE INTO episodes 
       (id, animeId, number, title, thumbnail, duration, watchProgress, isWatched, 
        downloadStatus, videoUrl, streamingUrls, skipIntro, skipOutro, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        episode.id,
        episode.animeId,
        episode.number,
        episode.title,
        episode.thumbnail,
        episode.duration,
        episode.watchProgress,
        episode.isWatched ? 1 : 0,
        episode.downloadStatus,
        episode.videoUrl || null,
        JSON.stringify(episode.streamingUrls),
        JSON.stringify(episode.skipIntro || null),
        JSON.stringify(episode.skipOutro || null),
      ]
    );
  }

  async getAnimeEpisodes(animeId: string): Promise<Episode[]> {
    if (!this.db) throw new Error('Base de données non initialisée');

    const results = await this.db.getAllAsync(
      'SELECT * FROM episodes WHERE animeId = ? ORDER BY number ASC',
      [animeId]
    ) as any[];

    return results.map(result => ({
      ...result,
      isWatched: Boolean(result.isWatched),
      streamingUrls: JSON.parse(result.streamingUrls || '[]'),
      skipIntro: JSON.parse(result.skipIntro || 'null'),
      skipOutro: JSON.parse(result.skipOutro || 'null'),
    }));
  }

  async updateEpisodeProgress(episodeId: string, progress: number, isWatched: boolean = false): Promise<void> {
    if (!this.db) throw new Error('Base de données non initialisée');

    await this.db.runAsync(
      'UPDATE episodes SET watchProgress = ?, isWatched = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [progress, isWatched ? 1 : 0, episodeId]
    );
  }

  // CRUD pour les listes
  async createAnimeList(name: string): Promise<string> {
    if (!this.db) throw new Error('Base de données non initialisée');

    const listId = `list-${Date.now()}`;
    await this.db.runAsync(
      'INSERT INTO animeLists (id, name) VALUES (?, ?)',
      [listId, name]
    );
    return listId;
  }

  async getAnimeLists(): Promise<AnimeList[]> {
    if (!this.db) throw new Error('Base de données non initialisée');

    const lists = await this.db.getAllAsync('SELECT * FROM animeLists ORDER BY isDefault DESC, name ASC') as any[];
    
    const result: AnimeList[] = [];
    for (const list of lists) {
      const animeIds = await this.db.getAllAsync(
        'SELECT animeId FROM listAnimes WHERE listId = ?',
        [list.id]
      ) as any[];

      result.push({
        id: list.id,
        name: list.name,
        isDefault: Boolean(list.isDefault),
        animeIds: animeIds.map(item => item.animeId),
        createdAt: new Date(list.createdAt),
        updatedAt: new Date(list.updatedAt),
      });
    }

    return result;
  }

  async addAnimeToList(listId: string, animeId: string): Promise<void> {
    if (!this.db) throw new Error('Base de données non initialisée');

    await this.db.runAsync(
      'INSERT OR IGNORE INTO listAnimes (listId, animeId) VALUES (?, ?)',
      [listId, animeId]
    );
  }

  async removeAnimeFromList(listId: string, animeId: string): Promise<void> {
    if (!this.db) throw new Error('Base de données non initialisée');

    await this.db.runAsync(
      'DELETE FROM listAnimes WHERE listId = ? AND animeId = ?',
      [listId, animeId]
    );
  }

  async deleteAnimeList(listId: string): Promise<void> {
    if (!this.db) throw new Error('Base de données non initialisée');

    // Ne pas supprimer la liste par défaut
    const list = await this.db.getFirstAsync(
      'SELECT isDefault FROM animeLists WHERE id = ?',
      [listId]
    ) as any;

    if (list?.isDefault) {
      throw new Error('Impossible de supprimer la liste par défaut');
    }

    await this.db.runAsync('DELETE FROM listAnimes WHERE listId = ?', [listId]);
    await this.db.runAsync('DELETE FROM animeLists WHERE id = ?', [listId]);
  }

  // Historique de visionnage
  async updateWatchHistory(animeId: string, episodeId: string, progress: number): Promise<void> {
    if (!this.db) throw new Error('Base de données non initialisée');

    await this.db.runAsync(
      `INSERT OR REPLACE INTO watchHistory (animeId, episodeId, progress, lastWatchedAt)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [animeId, episodeId, progress]
    );
  }

  async getWatchHistory(limit: number = 20): Promise<WatchHistory[]> {
    if (!this.db) throw new Error('Base de données non initialisée');

    const results = await this.db.getAllAsync(
      'SELECT * FROM watchHistory ORDER BY lastWatchedAt DESC LIMIT ?',
      [limit]
    ) as any[];

    return results.map(result => ({
      animeId: result.animeId,
      episodeId: result.episodeId,
      lastWatchedAt: new Date(result.lastWatchedAt),
      progress: result.progress,
    }));
  }

  async getRecentlyWatchedAnimes(limit: number = 10): Promise<Anime[]> {
    if (!this.db) throw new Error('Base de données non initialisée');

    const results = await this.db.getAllAsync(
      `SELECT DISTINCT a.* FROM animes a
       INNER JOIN watchHistory wh ON a.id = wh.animeId
       ORDER BY wh.lastWatchedAt DESC LIMIT ?`,
      [limit]
    ) as any[];

    return results.map(result => ({
      ...result,
      genres: JSON.parse(result.genres || '[]'),
    }));
  }

  // Statut utilisateur des animés
  async updateUserAnimeStatus(status: UserAnimeStatus): Promise<void> {
    if (!this.db) throw new Error('Base de données non initialisée');

    await this.db.runAsync(
      `INSERT OR REPLACE INTO userAnimeStatus 
       (animeId, status, currentEpisode, score, startDate, finishDate, notes, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        status.animeId,
        status.status,
        status.currentEpisode,
        status.score || null,
        status.startDate?.toISOString() || null,
        status.finishDate?.toISOString() || null,
        status.notes || null,
      ]
    );
  }

  async getUserAnimeStatus(animeId: string): Promise<UserAnimeStatus | null> {
    if (!this.db) throw new Error('Base de données non initialisée');

    const result = await this.db.getFirstAsync(
      'SELECT * FROM userAnimeStatus WHERE animeId = ?',
      [animeId]
    ) as any;

    if (!result) return null;

    return {
      animeId: result.animeId,
      status: result.status as WatchStatus,
      currentEpisode: result.currentEpisode,
      score: result.score,
      startDate: result.startDate ? new Date(result.startDate) : undefined,
      finishDate: result.finishDate ? new Date(result.finishDate) : undefined,
      notes: result.notes,
    };
  }

  // Paramètres
  async getSetting(key: string): Promise<string | null> {
    if (!this.db) throw new Error('Base de données non initialisée');

    const result = await this.db.getFirstAsync(
      'SELECT value FROM settings WHERE key = ?',
      [key]
    ) as any;

    return result?.value || null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Base de données non initialisée');

    await this.db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value]
    );
  }

  // Nettoyage
  async clearCache(): Promise<void> {
    if (!this.db) throw new Error('Base de données non initialisée');

    // Supprimer les animés sans épisodes téléchargés et non dans les listes
    await this.db.runAsync(`
      DELETE FROM animes 
      WHERE id NOT IN (SELECT DISTINCT animeId FROM listAnimes)
      AND id NOT IN (SELECT DISTINCT animeId FROM episodes WHERE downloadStatus = 'downloaded')
    `);

    // Supprimer les épisodes non téléchargés anciens
    await this.db.runAsync(`
      DELETE FROM episodes 
      WHERE downloadStatus != 'downloaded' 
      AND updatedAt < datetime('now', '-7 days')
    `);
  }
}

export default new DatabaseService(); 