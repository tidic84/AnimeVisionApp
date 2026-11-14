// Host identification, URL helpers, unpacking and server probing of streamHosts.ts.
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');

const pages = new Map();
const fetch = async (url, options = {}) => {
  const page = pages.get(url);
  if (page instanceof Error) throw page;
  if (!page) return { status: 404, url, text: async () => 'not found' };
  return { status: page.status ?? 200, url: page.url ?? url, text: async () => page.body, headers: options.headers };
};
const hosts = loadTs('services/streamHosts.ts', {}, { fetch });
const { resolveUrl, hostOf, isBrokenEmbed, orderServers, unpack, decodeVoe, probeServer } = hosts;

// resolveUrl: React Native's URL cannot resolve relative paths, this helper must.
assert.equal(resolveUrl('https://a/b.m3u8', 'https://x/y/z'), 'https://a/b.m3u8');
assert.equal(resolveUrl('//cdn.x/v.mp4', 'https://x/y'), 'https://cdn.x/v.mp4');
assert.equal(resolveUrl('/v/1.mp4', 'https://x.ru:8080/shell.php?id=1'), 'https://x.ru:8080/v/1.mp4');
assert.equal(resolveUrl('seg-1.ts', 'https://x/hls/master.m3u8?token=a#t'), 'https://x/hls/seg-1.ts');
assert.equal(resolveUrl('720/index.m3u8', 'https://x/hls/'), 'https://x/hls/720/index.m3u8');

// hostOf: by domain, never by the anime-sama server name.
assert.equal(hostOf('https://voe.sx/e/abc').id, 'voe');
assert.equal(hostOf('https://ANSEMBED.net/embed-1.html').id, 'vidmoly', 'ansembed.net is a Vidmoly mirror');
assert.equal(hostOf('https://vidmoly.biz/embed-1.html').id, 'vidmoly');
assert.equal(hostOf('https://oneupload.to/embed-1.html').id, 'oneupload');
assert.equal(hostOf('https://minochinos.com/v/1').id, 'vidhide');
assert.equal(hostOf('https://vk.com/video_ext.php?oid=1').id, 'vk');
assert.equal(hostOf('https://notvk.com/x').id, 'notvk.com', 'vk only matches vk.com and its subdomains');
assert.equal(hostOf('https://susanexpectcare.com/e/abcdefghij12').id, 'voe', 'Voe mirrors keep /e/<code>');
assert.equal(hostOf('https://susanexpectcare.com/e/short').id, 'susanexpectcare.com');
assert.deepEqual(hostOf('https://www.unknown-host.net/v/1'), { id: 'www.unknown-host.net', label: 'unknown-host.net' });
assert.deepEqual(hostOf('not a url'), { id: 'inconnu', label: 'Lecteur' });

// isBrokenEmbed: links without a video id never open.
assert.equal(isBrokenEmbed('https://video.sibnet.ru/shell.php?videoid='), true);
assert.equal(isBrokenEmbed('https://video.sibnet.ru/shell.php?videoid=123'), false);
assert.equal(isBrokenEmbed('https://vidmoly.to/embed-.html'), true);
assert.equal(isBrokenEmbed('https://vidmoly.to/embed-abc.html'), false);
assert.equal(isBrokenEmbed('https://voe.sx/e/'), true);
assert.equal(isBrokenEmbed('https://embed4me.com/x'), true);
assert.equal(isBrokenEmbed('https://embed4me.com/x#id'), false);
assert.equal(isBrokenEmbed('garbage'), true);

// orderServers: favourite hosts first, original order otherwise (stable).
const servers = ['https://sibnet.ru/1', 'https://voe.sx/e/1', 'https://unknown/1', 'https://vidmoly.to/1', 'https://voe.sx/e/2']
  .map((url, index) => ({ name: `S${index}`, url, quality: 'HD', langue: 'VF' }));
assert.deepEqual(orderServers(servers, ['vidmoly', 'voe']).map(server => server.name), ['S3', 'S1', 'S4', 'S0', 'S2']);
assert.deepEqual(orderServers(servers, []).map(server => server.name), ['S0', 'S1', 'S2', 'S3', 'S4']);

// unpack: Dean Edwards packer as used by Uqload, VidHide, Vidmoly.
const packed = `eval(function(p,a,c,k,e,d){}('0 1={"2":"3"}',36,4,'var|cfg|hls2|https://cdn.example/v/master.m3u8'.split('|'),0,{}))`;
assert.equal(unpack(packed), 'var cfg={"hls2":"https://cdn.example/v/master.m3u8"}');
assert.equal(unpack('<html>nothing packed</html>'), '');

// decodeVoe: ROT13, junk separators, base64, shift by 3, reversal, base64.
const encodeVoe = value => {
  const shifted = Array.from(Buffer.from(JSON.stringify(value)).toString('base64').split('').reverse().join(''), char => String.fromCharCode(char.charCodeAt(0) + 3)).join('');
  const rot = Buffer.from(shifted, 'latin1').toString('base64').replace(/[a-zA-Z]/g, char => { const start = char <= 'Z' ? 65 : 97; return String.fromCharCode((char.charCodeAt(0) - start + 13) % 26 + start); });
  return rot.slice(0, 4) + '@$' + rot.slice(4, 9) + '^^' + rot.slice(9);
};
const voeConfig = { source: 'https://delivery/v.m3u8', fallback: [{ file: 'https://delivery/v.mp4', label: '720' }], file_code: 'abc123' };
const voePage = `<script type="application/json">["${encodeVoe(voeConfig)}"]</script>`;
assert.deepEqual(decodeVoe(voePage), voeConfig);
assert.equal(decodeVoe('<script type="application/json">["!!!"]</script>'), null);
assert.equal(decodeVoe('<html></html>'), null);

(async () => {
  const server = url => ({ name: 'Lecteur', url, quality: 'HD', langue: 'VOSTFR' });
  const dead = async (url, reason) => assert.deepEqual(await probeServer(server(url)), { status: 'dead', reason });

  await dead('https://video.sibnet.ru/shell.php?videoid=', 'Lien du lecteur incomplet');
  // Embed4me: web player only when its page answers; a dead domain (anime-sama marks it dead) is not « working ».
  pages.set('https://embed4me.com/p#abc', { body: '<html><div id="app"></div></html>' });
  assert.deepEqual(await probeServer(server('https://embed4me.com/p#abc')), { status: 'embed', reason: 'Lecteur web uniquement' });
  pages.set('https://lpayer.embed4me.com/#hlw16', Object.assign(new Error('aborted'), { name: 'AbortError' }));
  await dead('https://lpayer.embed4me.com/#hlw16', 'Le lecteur ne répond pas');
  assert.equal(hosts.isWebOnlyHost('https://lpayer.embed4me.com/#hlw16'), true);
  assert.equal(hosts.isWebOnlyHost('https://ansembed.net/embed-1.html'), false);
  pages.set('https://vidmoly.to/embed-gone.html', { status: 410, body: '' });
  await dead('https://vidmoly.to/embed-gone.html', 'Vidéo supprimée');
  pages.set('https://video.sibnet.ru/shell.php?videoid=403', { status: 403, body: '' });
  await dead('https://video.sibnet.ru/shell.php?videoid=403', 'Accès refusé par l’hébergeur');
  pages.set('https://uqload.to/embed-500.html', { status: 502, body: '' });
  await dead('https://uqload.to/embed-500.html', 'Erreur 502');
  pages.set('https://uqload.to/embed-del.html', { body: '<html><h1>File was deleted</h1></html>' });
  await dead('https://uqload.to/embed-del.html', 'Vidéo supprimée ou privée');

  // Sibnet: relative MP4 resolved against the page, Referer set to the page origin.
  pages.set('https://video.sibnet.ru/shell.php?videoid=1', { body: 'player.src([{src: "/v/abc/1.mp4", type: "video/mp4"}])' });
  const sibnet = await probeServer(server('https://video.sibnet.ru/shell.php?videoid=1'));
  assert.equal(sibnet.status, 'ok');
  assert.equal(sibnet.url, 'https://video.sibnet.ru/v/abc/1.mp4');
  assert.equal(sibnet.headers.Referer, 'https://video.sibnet.ru/');
  assert.deepEqual(sibnet.qualities, []);

  // HLS: first reachable manifest wins, its resolutions become qualities (best first, Auto on top).
  pages.set('https://vidmoly.to/embed-hls.html', { body: '<script>sources:[{file:"https://cdn/dead/master.m3u8"},{file:"https://cdn/ok/master.m3u8"}], tracks:[{file:"/thumbs.vtt", kind:"thumbnails"}]</script>' });
  pages.set('https://cdn/ok/master.m3u8', { body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1280x720\n720/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2,RESOLUTION=1920x1080\n1080/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3,RESOLUTION=1920x1080\nother/index.m3u8\n' });
  const hls = await probeServer(server('https://vidmoly.to/embed-hls.html'));
  assert.equal(hls.status, 'ok');
  assert.equal(hls.url, 'https://cdn/ok/master.m3u8');
  assert.equal(hls.height, 1080);
  assert.deepEqual(hls.qualities.map(quality => quality.label), ['Auto', '1080p', '720p']);
  assert.equal(hls.qualities[1].url, 'https://cdn/ok/1080/index.m3u8');
  assert.equal(hls.thumbnails, 'https://vidmoly.to/thumbs.vtt');

  // Vidmoly through its ansembed.net mirror (anime-sama, 11/2026): single-quoted jwplayer source, master playlist.
  pages.set('https://ansembed.net/embed-qmt17aovk5w3.html', { body: "<script>player.setup({ sources: [{ file: 'https://prx.vmpx.online/hls2/04/qmt17aovk5w3_n/master.m3u8?t=a&s=1&e=43200' }], image: 'x.jpg' });</script>" });
  pages.set('https://prx.vmpx.online/hls2/04/qmt17aovk5w3_n/master.m3u8?t=a&s=1&e=43200', { body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1920x1080\nindex-v1-a1.m3u8\n' });
  const vidmoly = await probeServer(server('https://ansembed.net/embed-qmt17aovk5w3.html'));
  assert.equal(vidmoly.status, 'ok');
  assert.equal(vidmoly.height, 1080);
  assert.equal(vidmoly.headers.Referer, 'https://ansembed.net/');

  // Voe: JavaScript redirect to the current mirror, then the encrypted configuration.
  pages.set('https://voe.sx/e/abcdefghijkl', { body: "<script>window.location.href = 'https://mirror.example/e/abcdefghijkl';</script>" });
  pages.set('https://mirror.example/e/abcdefghijkl', { body: voePage });
  pages.set('https://delivery/v.m3u8', { body: '#EXTM3U\n#EXTINF:10,\nseg.ts\n' });
  const voe = await probeServer(server('https://voe.sx/e/abcdefghijkl'));
  assert.equal(voe.status, 'ok');
  assert.equal(voe.url, 'https://delivery/v.m3u8');
  assert.deepEqual(voe.qualities, [], 'a single-variant manifest offers no quality menu');
  assert.equal(voe.thumbnails, 'https://mirror.example/engine/storyboard/abc123?t=0');

  // Nothing extractable, timeouts and network failures.
  pages.set('https://uqload.to/embed-empty.html', { body: '<html>player loading…</html>' });
  assert.deepEqual(await probeServer(server('https://uqload.to/embed-empty.html')), { status: 'embed', reason: 'Flux non extractible' });
  pages.set('https://uqload.to/embed-slow.html', Object.assign(new Error('aborted'), { name: 'AbortError' }));
  await dead('https://uqload.to/embed-slow.html', 'Le lecteur ne répond pas');
  pages.set('https://uqload.to/embed-offline.html', new TypeError('Network request failed'));
  await dead('https://uqload.to/embed-offline.html', 'Hébergeur injoignable');
  console.log('stream hosts tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
