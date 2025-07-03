import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  SafeAreaView,
  useColorScheme,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MainTabScreenProps } from '../../types/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SettingsScreenProps = MainTabScreenProps<'Settings'>;

const Colors = {
  light: {
    primary: '#6366f1',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    card: '#ffffff',
    danger: '#dc2626',
    success: '#16a34a',
  },
  dark: {
    primary: '#818cf8',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    border: '#334155',
    card: '#1e293b',
    danger: '#ef4444',
    success: '#22c55e',
  },
};

interface AppSettings {
  // MyAnimeList
  malEnabled: boolean;
  malUsername: string;
  malToken: string;
  
  // Lecture
  defaultQuality: string;
  autoplay: boolean;
  skipIntro: boolean;
  skipOutro: boolean;
  subtitlesEnabled: boolean;
  
  // Téléchargements
  downloadQuality: string;
  wifiOnly: boolean;
  autoDelete: boolean;
  maxStorageGB: number;
  
  // Notifications
  notificationsEnabled: boolean;
  newEpisodesNotif: boolean;
  remindersEnabled: boolean;
  
  // Interface
  darkMode: boolean;
  language: string;
}

const QUALITY_OPTIONS = [
  { value: '480p', label: '480p (Standard)' },
  { value: '720p', label: '720p (HD)' },
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '1440p', label: '1440p (2K)' },
];

const STORAGE_OPTIONS = [
  { value: 1, label: '1 GB' },
  { value: 2, label: '2 GB' },
  { value: 5, label: '5 GB' },
  { value: 10, label: '10 GB' },
  { value: 20, label: '20 GB' },
  { value: 50, label: '50 GB' },
];

const SettingsScreen: React.FC<SettingsScreenProps> = () => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  
  const [settings, setSettings] = useState<AppSettings>({
    malEnabled: false,
    malUsername: '',
    malToken: '',
    defaultQuality: '720p',
    autoplay: true,
    skipIntro: false,
    skipOutro: false,
    subtitlesEnabled: true,
    downloadQuality: '720p',
    wifiOnly: true,
    autoDelete: false,
    maxStorageGB: 5,
    notificationsEnabled: true,
    newEpisodesNotif: true,
    remindersEnabled: false,
    darkMode: colorScheme === 'dark',
    language: 'fr',
  });

  const [showQualityModal, setShowQualityModal] = useState(false);
  const [showDownloadQualityModal, setShowDownloadQualityModal] = useState(false);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [showMalModal, setShowMalModal] = useState(false);
  const [malUsername, setMalUsername] = useState('');
  const [storageUsed, setStorageUsed] = useState(0);

  useEffect(() => {
    loadSettings();
    calculateStorageUsed();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await AsyncStorage.getItem('appSettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } catch (error) {
      console.error('[Settings] Erreur lors du chargement des paramètres:', error);
    }
  };

  const saveSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      setSettings(updatedSettings);
      await AsyncStorage.setItem('appSettings', JSON.stringify(updatedSettings));
    } catch (error) {
      console.error('[Settings] Erreur lors de la sauvegarde des paramètres:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder les paramètres');
    }
  };

  const calculateStorageUsed = async () => {
    // TODO: Calculer l'espace de stockage utilisé par les téléchargements
    setStorageUsed(2.3); // Exemple: 2.3 GB utilisés
  };

  const handleMalSync = async () => {
    if (settings.malEnabled) {
      // Désactiver MAL
      Alert.alert(
        'Désactiver MyAnimeList',
        'Voulez-vous vraiment désactiver la synchronisation avec MyAnimeList ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Désactiver',
            style: 'destructive',
            onPress: () => saveSettings({
              malEnabled: false,
              malUsername: '',
              malToken: '',
            }),
          },
        ]
      );
    } else {
      setShowMalModal(true);
    }
  };

  const connectToMAL = async () => {
    if (!malUsername.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer votre nom d\'utilisateur MyAnimeList');
      return;
    }

    try {
      // TODO: Implémenter l'authentification OAuth avec MyAnimeList
      // Pour l'instant, on simule une connexion réussie
      await saveSettings({
        malEnabled: true,
        malUsername: malUsername.trim(),
        malToken: 'mock_token', // En réalité, ce serait le token OAuth
      });
      
      setShowMalModal(false);
      setMalUsername('');
      Alert.alert('Succès', 'Connexion à MyAnimeList réussie !');
    } catch (error) {
      console.error('[Settings] Erreur lors de la connexion MAL:', error);
      Alert.alert('Erreur', 'Impossible de se connecter à MyAnimeList');
    }
  };

  const clearCache = async () => {
    Alert.alert(
      'Vider le cache',
      'Cette action supprimera toutes les données mises en cache. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Vider',
          style: 'destructive',
          onPress: async () => {
            try {
              // TODO: Implémenter la suppression du cache
              Alert.alert('Succès', 'Cache vidé avec succès');
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de vider le cache');
            }
          },
        },
      ]
    );
  };

  const clearDownloads = async () => {
    Alert.alert(
      'Supprimer tous les téléchargements',
      'Cette action supprimera tous les épisodes téléchargés. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              // TODO: Implémenter la suppression des téléchargements
              Alert.alert('Succès', 'Tous les téléchargements ont été supprimés');
              calculateStorageUsed();
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de supprimer les téléchargements');
            }
          },
        },
      ]
    );
  };

  const openURL = (url: string) => {
    Linking.openURL(url);
  };

  const renderSection = (title: string, children: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );

  const renderSettingRow = (
    icon: string,
    title: string,
    subtitle?: string,
    value?: string,
    onPress?: () => void,
    switchValue?: boolean,
    onSwitchChange?: (value: boolean) => void,
    danger?: boolean
  ) => (
    <TouchableOpacity
      style={[styles.settingRow, onPress && styles.settingRowPressable]}
      onPress={onPress}
      disabled={!onPress && !onSwitchChange}
    >
      <View style={styles.settingRowLeft}>
        <Ionicons
          name={icon as any}
          size={24}
          color={danger ? colors.danger : colors.primary}
          style={styles.settingIcon}
        />
        <View style={styles.settingText}>
          <Text style={[styles.settingTitle, { color: danger ? colors.danger : colors.text }]}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      
      <View style={styles.settingRowRight}>
        {value && (
          <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
            {value}
          </Text>
        )}
        {onSwitchChange && (
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={switchValue ? 'white' : colors.textSecondary}
          />
        )}
        {onPress && (
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        )}
      </View>
    </TouchableOpacity>
  );

  const renderQualityModal = (
    visible: boolean,
    onClose: () => void,
    currentValue: string,
    onSelect: (value: string) => void,
    title: string
  ) => (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
          
          {QUALITY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionRow,
                { borderBottomColor: colors.border },
                currentValue === option.value && { backgroundColor: colors.primary + '20' }
              ]}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
            >
              <Text style={[
                styles.optionText,
                { color: currentValue === option.value ? colors.primary : colors.text }
              ]}>
                {option.label}
              </Text>
              {currentValue === option.value && (
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
          
          <TouchableOpacity
            style={[styles.modalButton, { backgroundColor: colors.border }]}
            onPress={onClose}
          >
            <Text style={[styles.modalButtonText, { color: colors.text }]}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderStorageModal = () => (
    <Modal
      visible={showStorageModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowStorageModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Stockage maximum</Text>
          
          {STORAGE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionRow,
                { borderBottomColor: colors.border },
                settings.maxStorageGB === option.value && { backgroundColor: colors.primary + '20' }
              ]}
              onPress={() => {
                saveSettings({ maxStorageGB: option.value });
                setShowStorageModal(false);
              }}
            >
              <Text style={[
                styles.optionText,
                { color: settings.maxStorageGB === option.value ? colors.primary : colors.text }
              ]}>
                {option.label}
              </Text>
              {settings.maxStorageGB === option.value && (
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
          
          <TouchableOpacity
            style={[styles.modalButton, { backgroundColor: colors.border }]}
            onPress={() => setShowStorageModal(false)}
          >
            <Text style={[styles.modalButtonText, { color: colors.text }]}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderMalModal = () => (
    <Modal
      visible={showMalModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowMalModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            Connecter MyAnimeList
          </Text>
          
          <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
            Entrez votre nom d'utilisateur MyAnimeList pour synchroniser votre liste et votre progression.
          </Text>
          
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text,
              }
            ]}
            placeholder="Nom d'utilisateur MyAnimeList"
            placeholderTextColor={colors.textSecondary}
            value={malUsername}
            onChangeText={setMalUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.border }]}
              onPress={() => {
                setShowMalModal(false);
                setMalUsername('');
              }}
            >
              <Text style={[styles.modalButtonText, { color: colors.text }]}>Annuler</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              onPress={connectToMAL}
            >
              <Text style={[styles.modalButtonText, { color: 'white' }]}>Connecter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* ... */}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* MyAnimeList */}
        {renderSection('MyAnimeList', (
          <>
            {renderSettingRow(
              'planet',
              settings.malEnabled ? 'Connecté à MyAnimeList' : 'Connecter MyAnimeList',
              settings.malEnabled ? `Utilisateur: ${settings.malUsername}` : 'Synchronisez votre liste et progression',
              undefined,
              handleMalSync,
              undefined,
              undefined
            )}
            {settings.malEnabled && (
              <>
                {renderSettingRow(
                  'sync',
                  'Synchronisation automatique',
                  'Mise à jour automatique du progrès',
                  undefined,
                  undefined,
                  true,
                  (value) => saveSettings({ malEnabled: value })
                )}
                {renderSettingRow(
                  'cloud-upload',
                  'Importer depuis MAL',
                  'Importer votre liste MyAnimeList',
                  undefined,
                  () => Alert.alert('Info', 'Fonctionnalité à venir')
                )}
              </>
            )}
          </>
        ))}

        {/* Lecture */}
        {renderSection('Lecture', (
          <>
            {renderSettingRow(
              'videocam',
              'Qualité par défaut',
              'Qualité vidéo préférée',
              QUALITY_OPTIONS.find(q => q.value === settings.defaultQuality)?.label,
              () => setShowQualityModal(true)
            )}
            {renderSettingRow(
              'play-circle',
              'Lecture automatique',
              'Passer automatiquement à l\'épisode suivant',
              undefined,
              undefined,
              settings.autoplay,
              (value) => saveSettings({ autoplay: value })
            )}
            {renderSettingRow(
              'play-skip-forward',
              'Skip intro automatique',
              'Ignorer automatiquement les génériques d\'ouverture',
              undefined,
              undefined,
              settings.skipIntro,
              (value) => saveSettings({ skipIntro: value })
            )}
            {renderSettingRow(
              'play-skip-back',
              'Skip outro automatique',
              'Ignorer automatiquement les génériques de fin',
              undefined,
              undefined,
              settings.skipOutro,
              (value) => saveSettings({ skipOutro: value })
            )}
            {renderSettingRow(
              'closed-captioning',
              'Sous-titres',
              'Afficher les sous-titres par défaut',
              undefined,
              undefined,
              settings.subtitlesEnabled,
              (value) => saveSettings({ subtitlesEnabled: value })
            )}
          </>
        ))}

        {/* Téléchargements */}
        {renderSection('Téléchargements', (
          <>
            {renderSettingRow(
              'download',
              'Qualité de téléchargement',
              'Qualité pour les téléchargements',
              QUALITY_OPTIONS.find(q => q.value === settings.downloadQuality)?.label,
              () => setShowDownloadQualityModal(true)
            )}
            {renderSettingRow(
              'wifi',
              'Wi-Fi uniquement',
              'Télécharger seulement en Wi-Fi',
              undefined,
              undefined,
              settings.wifiOnly,
              (value) => saveSettings({ wifiOnly: value })
            )}
            {renderSettingRow(
              'trash',
              'Suppression automatique',
              'Supprimer les épisodes visionnés',
              undefined,
              undefined,
              settings.autoDelete,
              (value) => saveSettings({ autoDelete: value })
            )}
            {renderSettingRow(
              'server',
              'Stockage maximum',
              `${storageUsed.toFixed(1)} GB utilisés`,
              `${settings.maxStorageGB} GB`,
              () => setShowStorageModal(true)
            )}
          </>
        ))}

        {/* Notifications */}
        {renderSection('Notifications', (
          <>
            {renderSettingRow(
              'notifications',
              'Notifications',
              'Activer les notifications push',
              undefined,
              undefined,
              settings.notificationsEnabled,
              (value) => saveSettings({ notificationsEnabled: value })
            )}
            {settings.notificationsEnabled && (
              <>
                {renderSettingRow(
                  'alert-circle',
                  'Nouveaux épisodes',
                  'Notification pour les nouveaux épisodes',
                  undefined,
                  undefined,
                  settings.newEpisodesNotif,
                  (value) => saveSettings({ newEpisodesNotif: value })
                )}
                {renderSettingRow(
                  'time',
                  'Rappels',
                  'Rappels pour continuer à regarder',
                  undefined,
                  undefined,
                  settings.remindersEnabled,
                  (value) => saveSettings({ remindersEnabled: value })
                )}
              </>
            )}
          </>
        ))}

        {/* Interface */}
        {renderSection('Interface', (
          <>
            {renderSettingRow(
              'moon',
              'Mode sombre',
              'Utiliser le thème sombre',
              undefined,
              undefined,
              settings.darkMode,
              (value) => saveSettings({ darkMode: value })
            )}
            {renderSettingRow(
              'language',
              'Langue',
              'Langue de l\'interface',
              'Français',
              () => Alert.alert('Info', 'Autres langues à venir')
            )}
          </>
        ))}

        {/* Stockage */}
        {renderSection('Stockage', (
          <>
            {renderSettingRow(
              'refresh',
              'Vider le cache',
              'Supprimer les données temporaires',
              undefined,
              clearCache
            )}
            {renderSettingRow(
              'trash-bin',
              'Supprimer tous les téléchargements',
              'Libérer l\'espace de stockage',
              undefined,
              clearDownloads,
              undefined,
              undefined,
              true
            )}
          </>
        ))}

        {/* À propos */}
        {renderSection('À propos', (
          <>
            {renderSettingRow(
              'information-circle',
              'Version',
              'AnimeVisionApp v1.0.0',
              undefined,
              undefined
            )}
            {renderSettingRow(
              'globe',
              'Site web',
              'anime-sama.fr',
              undefined,
              () => openURL('https://anime-sama.fr')
            )}
            {renderSettingRow(
              'help-circle',
              'Support',
              'Aide et assistance',
              undefined,
              () => Alert.alert('Support', 'Contactez-nous à support@animevision.app')
            )}
            {renderSettingRow(
              'document-text',
              'Conditions d\'utilisation',
              undefined,
              undefined,
              () => Alert.alert('Info', 'Conditions d\'utilisation à venir')
            )}
            {renderSettingRow(
              'shield-checkmark',
              'Politique de confidentialité',
              undefined,
              undefined,
              () => Alert.alert('Info', 'Politique de confidentialité à venir')
            )}
          </>
        ))}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Fait avec ❤️ pour les fans d'anime
          </Text>
        </View>
      </ScrollView>

      {/* Modals */}
      {renderQualityModal(
        showQualityModal,
        () => setShowQualityModal(false),
        settings.defaultQuality,
        (value) => saveSettings({ defaultQuality: value }),
        'Qualité par défaut'
      )}
      
      {renderQualityModal(
        showDownloadQualityModal,
        () => setShowDownloadQualityModal(false),
        settings.downloadQuality,
        (value) => saveSettings({ downloadQuality: value }),
        'Qualité de téléchargement'
      )}
      
      {renderStorageModal()}
      {renderMalModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  sectionContent: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  settingRowPressable: {
    opacity: 1,
  },
  settingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: 12,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  settingRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 14,
    marginRight: 8,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingBottom: 100,
  },
  footerText: {
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 12,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  optionText: {
    fontSize: 16,
    flex: 1,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
  },
});

export default SettingsScreen; 