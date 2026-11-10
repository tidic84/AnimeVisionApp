// Windows limite les chemins à 260 caractères (LongPathsEnabled=0) : depuis gesture-handler 3, un dossier objet
// CMake du codegen dépasse cette limite et ninja échoue sur mkdir. CMake raccourcit (hache) les chemins d'objets
// au-delà de CMAKE_OBJECT_PATH_MAX : on l'abaisse pour le module app.
const { withAppBuildGradle } = require('expo/config-plugins');

const LINE = 'externalNativeBuild { cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=240" } }';

module.exports = config => withAppBuildGradle(config, gradle => {
  if (!gradle.modResults.contents.includes('CMAKE_OBJECT_PATH_MAX')) {
    gradle.modResults.contents = gradle.modResults.contents.replace(/defaultConfig \{\n/, match => `${match}        ${LINE}\n`);
  }
  return gradle;
});
