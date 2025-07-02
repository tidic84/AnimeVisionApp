import React, { useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

interface WebViewVideoPlayerProps {
  embedUrl: string;
  onClose: () => void;
  onError?: (error: string) => void;
  style?: any;
}

const WebViewVideoPlayer: React.FC<WebViewVideoPlayerProps> = ({
  embedUrl,
  onClose,
  onError,
  style
}) => {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Injecter du CSS pour optimiser l'affichage vidéo en plein écran
  const injectedCSS = `
    <style>
      body {
        margin: 0 !important;
        padding: 0 !important;
        background: #000 !important;
        overflow: hidden !important;
      }
      
      /* Masquer les éléments de navigation et publicités */
      .ads, .advertisement, .banner, .popup, 
      .navigation, .nav, .header, .footer,
      .sidebar, .menu, .controls-bar,
      [class*="ad"], [id*="ad"], [class*="banner"], [id*="banner"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        height: 0 !important;
        width: 0 !important;
      }
      
      /* Optimiser le player vidéo */
      video, iframe, embed, object,
      [class*="player"], [id*="player"],
      [class*="video"], [id*="video"] {
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        z-index: 9999 !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      /* Forcer le plein écran */
      html, body {
        width: 100vw !important;
        height: 100vh !important;
        overflow: hidden !important;
      }
    </style>
  `;

  // JavaScript à injecter pour optimiser l'expérience
  const injectedJS = `
    (function() {
      // Masquer les éléments indésirables
      function hideAds() {
        const selectors = ['.ads', '.advertisement', '.banner', '.popup'];
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => el.style.display = 'none');
        });
      }
      
      // Optimiser le player vidéo
      function optimizePlayer() {
        const videos = document.querySelectorAll('video, iframe');
        videos.forEach(video => {
          video.style.width = '100vw';
          video.style.height = '100vh';
        });
      }
      
      hideAds();
      optimizePlayer();
      
      setTimeout(() => {
        hideAds();
        optimizePlayer();
        window.ReactNativeWebView.postMessage('loaded');
      }, 2000);
      
      true;
    })();
  `;

  const handleLoadEnd = () => setLoading(false);
  const handleError = () => {
    setError('Erreur de chargement');
    setLoading(false);
  };

  const handleMessage = (event: any) => {
    if (event.nativeEvent.data === 'loaded') {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Impossible de charger la vidéo</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      )}
      
      <WebView
        ref={webViewRef}
        source={{ uri: embedUrl }}
        style={styles.webview}
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={true}
        allowsFullscreenVideo={true}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onMessage={handleMessage}
        injectedJavaScript={injectedJS}
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
      />
      
      <TouchableOpacity style={styles.floatingCloseButton} onPress={onClose}>
        <Ionicons name="close" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    zIndex: 1000,
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
  },
  closeText: {
    color: '#fff',
    fontSize: 16,
  },
  floatingCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default WebViewVideoPlayer; 