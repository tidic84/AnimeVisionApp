import React from 'react';
import { StyleSheet } from 'react-native';
import { WebView as RNWebView, WebViewMessageEvent } from 'react-native-webview';
import type { AndroidWebViewProps, IOSWebViewProps } from 'react-native-webview/lib/WebViewTypes';
import { STREAM_USER_AGENT } from '../services/streamHosts';

// react-native-webview 14 type WebViewProps comme l'intersection iOS & Android & Windows, qui se réduit à never.
const WebView = RNWebView as unknown as React.ComponentType<AndroidWebViewProps & IOSWebViewProps & React.RefAttributes<RNWebView>>;

interface WebViewVideoPlayerProps {
  embedUrl: string;
  /** Appelé quand la page indique que la vidéo est introuvable ou que son lecteur échoue. */
  onDead: (reason: string) => void;
}

// Les pages d'embed ouvrent des publicités au premier appui : window.open les chargeait à la place du lecteur (écran noir).
const BEFORE_LOAD = `window.open = function () { return null; }; true;`;
// Signale à l'app une vidéo supprimée ou une erreur du lecteur JW Player / Video.js.
const WATCH = `(function () {
  var sent = false;
  function report(reason) { if (!sent) { sent = true; window.ReactNativeWebView.postMessage('dead:' + reason); } }
  function check() {
    var text = (document.body && document.body.innerText || '').slice(0, 4000);
    if (/file (was )?(not found|deleted|removed)|video (not found|is not available|has been (deleted|removed))|embed restricted|request forbidden/i.test(text)) report('Vidéo supprimée ou inaccessible');
    else if (document.querySelector('.jw-state-error, .vjs-error')) report('Le lecteur de l’hébergeur n’arrive pas à lire la vidéo');
  }
  check();
  setInterval(check, 2000);
  true;
})();`;

const sameVideo = (url: string, embedUrl: string) => {
  try {
    const target = new URL(url);
    const origin = new URL(embedUrl);
    const code = origin.pathname.split('/').filter(Boolean).pop()?.replace(/^embed-|\.html$/g, '');
    return target.hostname === origin.hostname || (!!code && code.length >= 6 && url.includes(code));
  } catch { return false; }
};

/** Lecteur web de l'hébergeur, utilisé quand le flux ne peut pas être extrait pour le lecteur natif. */
export default function WebViewVideoPlayer({ embedUrl, onDead }: WebViewVideoPlayerProps) {
  const onMessage = (event: WebViewMessageEvent) => {
    const data = event.nativeEvent.data;
    if (data.startsWith('dead:')) onDead(data.slice(5));
  };
  return <WebView source={{ uri: embedUrl }} style={StyleSheet.absoluteFill} userAgent={STREAM_USER_AGENT}
    allowsFullscreenVideo allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} setSupportMultipleWindows={false}
    injectedJavaScriptBeforeContentLoaded={BEFORE_LOAD} injectedJavaScript={WATCH} onMessage={onMessage}
    // Les redirections du même hébergeur (Voe change de domaine en gardant le code de la vidéo) passent, les publicités non.
    onShouldStartLoadWithRequest={request => !request.isTopFrame || /^(about|data|blob):/.test(request.url) || sameVideo(request.url, embedUrl)}
    onHttpError={event => { if (event.nativeEvent.statusCode >= 400) onDead(`Erreur ${event.nativeEvent.statusCode} de l’hébergeur`); }}
    onError={() => onDead('Ce lecteur ne répond pas')} />;
}
