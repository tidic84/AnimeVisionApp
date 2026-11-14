import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView as RNWebView, WebViewMessageEvent } from 'react-native-webview';
import type { AndroidWebViewProps, IOSWebViewProps } from 'react-native-webview/lib/WebViewTypes';
import { registerPdfRenderer } from '../services/comics/localLibrary';
import { PDF_RUNNER } from '../services/comics/localFiles';

// react-native-webview 14 type WebViewProps comme l'intersection iOS & Android & Windows, qui se réduit à never.
const WebView = RNWebView as unknown as React.ComponentType<AndroidWebViewProps & IOSWebViewProps & React.RefAttributes<RNWebView>>;

// pdf.js a besoin d'un canvas : sur Android, chaque page est rendue dans cette WebView invisible puis renvoyée en JPEG.
const HTML = `<!doctype html><html><body><script>${PDF_RUNNER}
async function onMessage(event) {
  const send = value => window.ReactNativeWebView.postMessage(JSON.stringify(value));
  try {
    const job = JSON.parse(event.data);
    const data = Uint8Array.from(atob(job.pdf), c => c.charCodeAt(0));
    await renderPdf(job.lib, job.worker, data, (index, total, image) => send({ type: 'page', index, total, image }));
    send({ type: 'done' });
  } catch (error) { send({ type: 'error', message: String(error && error.message || error) }); }
}
window.addEventListener('message', onMessage); document.addEventListener('message', onMessage);
</script></body></html>`;

interface Job { payload: string; emit: (index: number, total: number, dataUrl: string) => Promise<void> | void; resolve: () => void; reject: (error: Error) => void }

/** Monte la WebView de rendu PDF le temps d'un import (un fichier à la fois). */
export default function PdfRenderHost() {
  const [job, setJob] = useState<Job | null>(null);
  const webView = useRef<RNWebView>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    registerPdfRenderer(([lib, worker], pdf, emit) => new Promise<void>((resolve, reject) => {
      writes.current = Promise.resolve();
      setJob({ payload: JSON.stringify({ lib, worker, pdf }), emit, resolve, reject });
    }));
    return () => registerPdfRenderer(null);
  }, []);
  if (!job) return null;
  const finish = (error?: Error) => { const current = job; setJob(null); void writes.current.then(() => error ? current.reject(error) : current.resolve(), current.reject); };
  const onMessage = (event: WebViewMessageEvent) => {
    const message = JSON.parse(event.nativeEvent.data);
    // Pages enregistrées dans l'ordre, avant de déclarer l'import terminé.
    if (message.type === 'page') writes.current = writes.current.then(() => job.emit(message.index, message.total, message.image));
    else finish(message.type === 'error' ? new Error(`PDF illisible : ${message.message}`) : undefined);
  };
  return <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }} pointerEvents="none">
    <WebView ref={webView} source={{ html: HTML, baseUrl: 'https://animevision.local/' }} originWhitelist={['*']} javaScriptEnabled
      onLoadEnd={() => webView.current?.postMessage(job.payload)} onMessage={onMessage}
      onError={() => finish(new Error('Le moteur PDF n’a pas pu démarrer.'))} />
  </View>;
}
