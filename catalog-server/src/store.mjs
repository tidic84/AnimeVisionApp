import { DatabaseSync } from 'node:sqlite';

const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const decode = row => row ? JSON.parse(row.document) : null;
export class CatalogStore {
  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS comics(id TEXT PRIMARY KEY, document TEXT NOT NULL, search_text TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, imported_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chapters(id TEXT PRIMARY KEY, comic_id TEXT NOT NULL REFERENCES comics(id), document TEXT NOT NULL, published_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS chapters_comic ON chapters(comic_id);
      CREATE INDEX IF NOT EXISTS chapters_date ON chapters(published_at DESC);
      CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY, document TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  comic(id) { return decode(this.db.prepare('SELECT document FROM comics WHERE id=?').get(id)); }
  chapter(id) { const row = this.db.prepare('SELECT comic_id, document FROM chapters WHERE id=?').get(id); return row ? { ...decode(row), comicId: row.comic_id } : null; }
  putComic(comic, now = new Date().toISOString()) {
    const previous = this.comic(comic.id);
    const next = { ...previous, ...comic, synopsis: comic.synopsis || previous?.synopsis || '', cover: comic.cover || previous?.cover, coverThumb: comic.coverThumb || previous?.coverThumb };
    this.db.prepare(`INSERT INTO comics VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document,search_text=excluded.search_text,kind=excluded.kind,status=excluded.status,updated_at=excluded.updated_at`)
      .run(comic.id, JSON.stringify(next), normalize([comic.title, ...(comic.altTitles || [])].join(' ')), comic.kind, comic.status, now, now);
  }
  putChapters(comicId, chapters, now = new Date().toISOString()) {
    this.db.exec('BEGIN');
    try {
      for (const chapter of chapters) {
        const previous = this.chapter(chapter.id);
        if (previous && previous.comicId !== comicId) throw new Error('Identifiant de chapitre associé à une autre œuvre.');
        const next = { ...previous, ...chapter, pages: chapter.pages || previous?.pages || 0, publishedAt: chapter.publishedAt || previous?.publishedAt };
        delete next.comicId;
        const published = next.publishedAt || now;
        this.db.prepare(`INSERT INTO chapters VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document,published_at=CASE WHEN json_extract(excluded.document,'$.publishedAt') IS NOT NULL THEN excluded.published_at ELSE chapters.published_at END`)
          .run(chapter.id, comicId, JSON.stringify(next), published);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  chapters(id) {
    return this.db.prepare('SELECT document FROM chapters WHERE comic_id=?').all(id).map(decode)
      .sort((a,b) => (Number(a.number) || 0) - (Number(b.number) || 0) || a.id.localeCompare(b.id));
  }
  getState(key) { return decode(this.db.prepare('SELECT document FROM state WHERE key=?').get(key)); }
  setState(key, value) { this.db.prepare('INSERT INTO state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET document=excluded.document').run(key, JSON.stringify(value)); }
  search({ kind = 'all', query = '', language = 'fr', status, tags = [], order = 'latest', offset = 0, limit = 24 } = {}) {
    if (!['fr', 'all', ''].includes(language)) return { items: [], total: 0 };
    const where = [], args = [];
    if (kind !== 'all') { where.push('c.kind=?'); args.push(kind); }
    if (status && status !== 'unknown') { where.push('c.status=?'); args.push(status); }
    for (const word of normalize(query).split(' ').filter(Boolean)) { where.push('c.search_text LIKE ?'); args.push(`%${word}%`); }
    for (const tag of tags) { where.push("EXISTS(SELECT 1 FROM json_each(c.document,'$.genres') WHERE value=?)"); args.push(tag); }
    const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM comics c ${condition}`).get(...args).n;
    const sort = { title: 'c.search_text ASC', added: 'c.imported_at ASC', popular: "COALESCE(json_extract(c.document,'$.rank'),999999) ASC", rating: "COALESCE(json_extract(c.document,'$.rank'),999999) ASC", latest: 'latest DESC' }[order] || 'latest DESC';
    const rows = this.db.prepare(`SELECT c.document, (SELECT MAX(published_at) FROM chapters WHERE comic_id=c.id AND json_extract(document,'$.publishedAt') IS NOT NULL) AS latest FROM comics c ${condition} ORDER BY ${sort},c.id ASC LIMIT ? OFFSET ?`).all(...args, limit, offset);
    return { items: rows.map(decode), total, next: offset + rows.length < total ? String(offset + rows.length) : undefined };
  }
  tags() { return this.db.prepare("SELECT DISTINCT value FROM comics,json_each(comics.document,'$.genres') ORDER BY value").all().map(r => ({ id:r.value, name:r.value })); }
  updates(limit = 24) {
    return this.db.prepare("SELECT c.document AS comic, ch.document AS chapter, ch.published_at FROM chapters ch JOIN comics c ON c.id=ch.comic_id WHERE json_extract(ch.document,'$.publishedAt') IS NOT NULL ORDER BY ch.published_at DESC,ch.id DESC LIMIT ?").all(limit)
      .map(r => ({ comic: JSON.parse(r.comic), chapter: JSON.parse(r.chapter), detectedAt: r.published_at }));
  }
  counts() { return { comics: this.db.prepare('SELECT COUNT(*) AS n FROM comics').get().n, chapters: this.db.prepare('SELECT COUNT(*) AS n FROM chapters').get().n }; }
}
