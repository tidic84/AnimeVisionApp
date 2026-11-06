const { withAppBuildGradle } = require('expo/config-plugins');

// Signe l'APK release avec la clé fournie par la CI (variables ANDROID_KEYSTORE_*).
// Sans ces variables, Gradle garde la clé de debug du modèle Expo.
const releaseConfig = `
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, result => {
    let gradle = result.modResults.contents;
    if (gradle.includes("System.getenv('ANDROID_KEYSTORE_PATH')")) return result;
    gradle = gradle.replace(/signingConfigs\s*\{/, match => match + releaseConfig);
    const patched = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
    );
    if (patched === gradle) throw new Error('withReleaseSigning: bloc release introuvable dans app/build.gradle');
    result.modResults.contents = patched;
    return result;
  });
};
