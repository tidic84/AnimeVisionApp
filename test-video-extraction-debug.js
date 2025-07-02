/**
 * Test de débogage complet pour l'extraction d'URLs vidéo avec la nouvelle API
 * Diagnostique les problèmes d'écran noir dans le player vidéo
 */

const { API_ADDRESS } = process.env;
const API_BASE = API_ADDRESS || 'https://formally-liberal-drum.ngrok-free.app';

console.log('🔍 Test de Débogage - Extraction URLs Vidéo');
console.log('='.repeat(50));
console.log(`🌐 API utilisée: ${API_BASE}`);

/**
 * Test 1: Récupération d'un épisode depuis l'API
 */
async function testEpisodeRetrieval() {
  console.log('\n📺 Test 1: Récupération Épisode depuis API');
  console.log('-'.repeat(30));
  
  try {
    // Utiliser un ID d'épisode de test
    const episodeId = '25827'; // ID d'exemple depuis le HLS doc
    
    console.log(`📡 Récupération épisode ${episodeId}...`);
    
    const response = await fetch(`${API_BASE}/api/episode/${episodeId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log('✅ Épisode récupéré avec succès');
    console.log(`📊 Structure de réponse:`, Object.keys(data));
    
    if (data.data) {
      console.log(`📋 Titre: ${data.data.titre_episode || 'N/A'}`);
      console.log(`🏷️ Numéro: ${data.data.num_episode || 'N/A'}`);
      console.log(`🎭 Anime: ${data.data.anime_titre || 'N/A'}`);
      
      if (data.data.streaming_servers && Array.isArray(data.data.streaming_servers)) {
        console.log(`🖥️ Serveurs de streaming: ${data.data.streaming_servers.length}`);
        
        data.data.streaming_servers.forEach((server, index) => {
          console.log(`  Server ${index + 1}: ${server.name} (${server.quality}) - ${server.url}`);
        });
        
        return data.data.streaming_servers;
      } else {
        console.log('❌ Aucun streaming_servers trouvé');
        return [];
      }
    } else {
      console.log('❌ Pas de données d\'épisode');
      return [];
    }
    
  } catch (error) {
    console.error('❌ Erreur récupération épisode:', error.message);
    return [];
  }
}

/**
 * Test 2: Extraction HLS depuis une URL embed
 */
async function testHLSExtraction(embedUrl) {
  console.log(`\n🎬 Test 2: Extraction HLS depuis Embed`);
  console.log('-'.repeat(30));
  console.log(`🔗 URL embed: ${embedUrl}`);
  
  try {
    // Simuler la logique du VideoUrlExtractor
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'DNT': '1'
    };

    console.log('📤 Envoi requête vers embed...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(embedUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`📥 Réponse: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📄 HTML récupéré: ${html.length} caractères`);
    
    // Vérifier la validité du HTML
    const isValidHtml = html.trim().startsWith('<') || html.includes('<html') || html.includes('<script') || html.includes('<div');
    
    if (!isValidHtml) {
      console.log('⚠️ HTML invalide ou corrompu');
      const sample = html.substring(0, 100).replace(/[^\x20-\x7E]/g, '?');
      console.log(`📋 Échantillon: ${sample}`);
      return [];
    }
    
    // Échantillon du HTML
    const sample = html.substring(0, 500);
    console.log(`📋 Début HTML: ${sample}...`);
    
    // Patterns de recherche HLS améliorés
    const hlsPatterns = [
      /https?:\/\/[^"'\s>]+\.m3u8[^"'\s>]*/gi,
      /"(https?:\/\/[^"]*\.m3u8[^"]*)"/gi,
      /'(https?:\/\/[^']*\.m3u8[^']*)'/gi,
      /source[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /file[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
      /src[:\s]*['"](https?:\/\/[^'"]*\.m3u8[^'"]*)['"]?/gi,
    ];
    
    const foundUrls = new Set();
    
    for (const pattern of hlsPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1] || match[0];
        if (url && url.includes('.m3u8')) {
          foundUrls.add(url);
        }
      }
    }
    
    const hlsUrls = Array.from(foundUrls);
    
    if (hlsUrls.length > 0) {
      console.log(`✅ ${hlsUrls.length} URLs HLS trouvées:`);
      hlsUrls.forEach((url, index) => {
        console.log(`  ${index + 1}. ${url}`);
      });
    } else {
      console.log('❌ Aucune URL HLS trouvée');
      
      // Chercher d'autres patterns vidéo
      const videoPatterns = [
        /https?:\/\/[^"'\s>]+\.(mp4|webm|avi|mkv)[^"'\s>]*/gi,
        /"(https?:\/\/[^"]*\.(mp4|webm|avi|mkv)[^"]*)"/gi,
        /'(https?:\/\/[^']*\.(mp4|webm|avi|mkv)[^']*)'/gi,
      ];
      
      const videoUrls = new Set();
      
      for (const pattern of videoPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const url = match[1] || match[0];
          if (url) {
            videoUrls.add(url);
          }
        }
      }
      
      if (videoUrls.size > 0) {
        console.log(`📺 URLs vidéo alternatives trouvées: ${videoUrls.size}`);
        Array.from(videoUrls).forEach((url, index) => {
          console.log(`  ${index + 1}. ${url}`);
        });
      }
    }
    
    return hlsUrls;
    
  } catch (error) {
    console.error('❌ Erreur extraction HLS:', error.message);
    return [];
  }
}

/**
 * Test 3: Vérification de la validité des URLs HLS
 */
async function testHLSValidity(hlsUrls) {
  console.log('\n🔍 Test 3: Validation URLs HLS');
  console.log('-'.repeat(30));
  
  if (hlsUrls.length === 0) {
    console.log('⚠️ Aucune URL HLS à valider');
    return;
  }
  
  for (let i = 0; i < hlsUrls.length; i++) {
    const url = hlsUrls[i];
    console.log(`\n🔗 Test URL ${i + 1}: ${url}`);
    
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
        }
      });
      
      console.log(`📊 Status: ${response.status} ${response.statusText}`);
      console.log(`📋 Type: ${response.headers.get('content-type') || 'N/A'}`);
      console.log(`📏 Taille: ${response.headers.get('content-length') || 'N/A'} bytes`);
      
      if (response.ok) {
        console.log('✅ URL HLS valide et accessible');
      } else {
        console.log('❌ URL HLS non accessible');
      }
      
    } catch (error) {
      console.log(`❌ Erreur validation: ${error.message}`);
    }
  }
}

/**
 * Test principal
 */
async function runMainTest() {
  try {
    console.log('🚀 Début des tests de débogage...\n');
    
    // Test 1: Récupérer un épisode
    const streamingServers = await testEpisodeRetrieval();
    
    if (streamingServers.length === 0) {
      console.log('\n❌ Arrêt des tests: aucun serveur de streaming trouvé');
      return;
    }
    
    // Test 2: Essayer d'extraire HLS depuis le premier serveur
    const firstServer = streamingServers[0];
    const hlsUrls = await testHLSExtraction(firstServer.url);
    
    // Test 3: Valider les URLs trouvées
    await testHLSValidity(hlsUrls);
    
    // Résumé final
    console.log('\n📊 RÉSUMÉ DES TESTS');
    console.log('='.repeat(30));
    console.log(`🖥️ Serveurs de streaming: ${streamingServers.length}`);
    console.log(`🎬 URLs HLS extraites: ${hlsUrls.length}`);
    
    if (hlsUrls.length > 0) {
      console.log('✅ Extraction HLS réussie - les vidéos devraient fonctionner');
    } else {
      console.log('❌ Aucune URL HLS extraite - problème d\'extraction');
      console.log('\n💡 Recommandations:');
      console.log('   1. Vérifier les patterns d\'extraction dans VideoUrlExtractor');
      console.log('   2. Ajouter des patterns spécifiques aux nouveaux serveurs');
      console.log('   3. Implémenter un fallback vers les URLs embed directes');
    }
    
  } catch (error) {
    console.error('❌ Erreur dans les tests:', error.message);
  }
}

// Exporter pour utilisation depuis d'autres scripts
if (typeof module !== 'undefined') {
  module.exports = {
    testEpisodeRetrieval,
    testHLSExtraction,
    testHLSValidity,
    runMainTest
  };
}

// Lancer les tests si le script est exécuté directement
if (require.main === module) {
  runMainTest().catch(console.error);
} 