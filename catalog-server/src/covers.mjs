// Cache only known, public cover URLs from the source's image host.
export function coverCache({ fetchImage = fetch, maxEntries = 128 } = {}) {
  const entries = new Map();
  return async comic => {
    const url = new URL(comic.cover || comic.coverThumb || 'about:blank');
    if (url.protocol !== 'https:' || url.hostname !== 'static.scan-manga.com' || url.username || url.password) throw new Error('Couverture non disponible.');
    const key = url.href;
    const cached = entries.get(key);
    if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.promise;
    if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
    const promise = (async () => {
      const response = await fetchImage(key, { headers: { Referer: 'https://www.scan-manga.com/' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Couverture temporairement indisponible.');
      const type = response.headers.get('content-type')?.split(';')[0];
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(type)) throw new Error('Format de couverture non pris en charge.');
      const chunks = []; let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > 2 * 1024 * 1024) throw new Error('Couverture trop volumineuse.');
        chunks.push(chunk);
      }
      return { type, bytes: Buffer.concat(chunks) };
    })();
    entries.set(key, { at: Date.now(), promise });
    try { return await promise; } catch (error) { entries.delete(key); throw error; }
  };
}
