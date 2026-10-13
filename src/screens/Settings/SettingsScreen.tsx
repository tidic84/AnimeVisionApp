import downloadService from '../../services/downloadService';
import apiService from '../../services/apiService';
import { useApi } from '../../contexts/ApiContext';
import { useTheme } from '../../contexts/ThemeContext';
import useReducedMotion from '../../hooks/useReducedMotion';
import { useAppColorScheme as useColorScheme } from '../../contexts/ThemeContext';
import { FadeIn } from '../../components/Motion';
import { palette } from '../../theme/palette';
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
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MainTabScreenProps } from '../../types/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SettingsScreenProps = MainTabScreenProps<'Settings'>;

const Colors = palette;

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
  const { isApiAvailable, setApiAvailable, setApiError } = useApi();
  const [checkingConnection, setCheckingConnection] = useState(false);
  const colorScheme = useColorScheme();
  const { setScheme } = useTheme();
  const reducedMotion = useReducedMotion();
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
  const [profileName, setProfileName] = useState('Mon profil');
  const [profileDraft, setProfileDraft] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [storageUsed, setStorageUsed] = useState(0);

  useEffect(() => {
    loadSettings();
    calculateStorageUsed();
    AsyncStorage.getItem('localProfileName').then(name => { if (name) setProfileName(name); }).catch(() => {});
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
      if (newSettings.darkMode !== undefined) setScheme(newSettings.darkMode ? 'dark' : 'light');
      await AsyncStorage.setItem('appSettings', JSON.stringify(updatedSettings));
    } catch (error) {
      console.error('[Settings] Erreur lors de la sauvegarde des paramètres:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder les paramètres');
    }
  };

  const calculateStorageUsed = async () => {
    try {
      const storage = await downloadService.getStorageInfo();
      setStorageUsed(Number((storage.usedSize / (1024 ** 3)).toFixed(2)));
    } catch { setStorageUsed(0); }
  };

  const retryConnection = async () => {
    if (checkingConnection) return;
    setCheckingConnection(true);
    try {
      const connected = await apiService.testConnection();
      setApiAvailable(connected);
      setApiError(connected ? null : 'Connexion au catalogue indisponible');
    } finally { setCheckingConnection(false); }
  };

  const saveProfile = async () => {
    const name = profileDraft.trim();
    if (!name) return;
    try {
      await AsyncStorage.setItem('localProfileName', name);
      setProfileName(name);
      setShowProfileModal(false);
    } catch { Alert.alert('Erreur', 'Impossible de sauvegarder le profil'); }
  };

  const openURL = (url: string) => {
    Linking.openURL(url);
  };

  const renderSection = (title: string, children: React.ReactNode) => (
    <FadeIn style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
        {children}
      </View>
    </FadeIn>
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
      style={[styles.settingRow, { borderBottomColor: colors.border }, onPress && styles.settingRowPressable]}
      onPress={onPress}
      disabled={!onPress && !onSwitchChange}
    >
      <View style={styles.settingRowLeft}>
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
            accessibilityLabel={title}
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
      animationType={reducedMotion ? 'none' : 'slide'}
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.textSecondary }]}>{title}</Text>

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
      animationType={reducedMotion ? 'none' : 'slide'}
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

  const renderProfileModal = () => (
    <Modal visible={showProfileModal} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setShowProfileModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Modifier mon profil</Text>
          <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>Votre pseudo est enregistré sur cet appareil.</Text>
          <TextInput accessibilityLabel="Pseudo du profil" style={[styles.textInput, { borderColor: colors.border, color: colors.text }]} value={profileDraft} onChangeText={setProfileDraft} maxLength={32} autoFocus returnKeyType="done" onSubmitEditing={saveProfile} />
          <View style={styles.modalActions}>
            <TouchableOpacity accessibilityRole="button" style={[styles.modalButton, { backgroundColor: colors.border }]} onPress={() => setShowProfileModal(false)}><Text style={{ color: colors.text }}>Annuler</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={!profileDraft.trim()} style={[styles.modalButton, { backgroundColor: colors.buttonBg, opacity: profileDraft.trim() ? 1 : 0.45 }]} onPress={saveProfile}><Text style={{ color: colors.buttonText }}>Enregistrer</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const editProfile = () => { setProfileDraft(profileName); setShowProfileModal(true); };
  const renderHeader = () => (
    <LinearGradient colors={['#F47521', '#70300C', colors.background]} locations={[0, 0.45, 1]} style={[styles.profileHeader, { paddingTop: insets.top + 20 }]}>
      <Text style={styles.pageTitle}>Mon compte</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Modifier mon profil" onPress={editProfile} style={styles.avatarButton}>
        <View style={styles.avatar}><Text style={styles.avatarInitial}>{profileName.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.editBadge}><Ionicons name="pencil-outline" size={21} color="#111" /></View>
      </TouchableOpacity>
      <Text style={styles.profileName}>{profileName}</Text>
    </LinearGradient>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {renderHeader()}
        {renderSection('Profil', renderSettingRow('person', 'Modifier le profil', undefined, undefined, editProfile))}
        {renderSection('Connexion', renderSettingRow('refresh', 'Connexion au catalogue', 'Vérifier la connexion et retrouver le catalogue', checkingConnection ? 'Vérification…' : isApiAvailable ? 'Connecté' : 'Hors ligne', retryConnection))}
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
      {renderProfileModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  profileHeader: { alignItems: 'center', paddingBottom: 48, minHeight: 300 },
  pageTitle: { color: '#FFF', fontSize: 23, fontWeight: '700', alignSelf: 'flex-start', marginLeft: 18, marginBottom: 30 },
  avatarButton: { width: 112, height: 112 },
  avatar: { width: 108, height: 108, borderRadius: 54, borderWidth: 2, borderColor: '#FFF', backgroundColor: '#202024', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#FFF', fontSize: 47, fontWeight: '600' },
  editBadge: { position: 'absolute', right: 0, bottom: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  profileName: { color: '#FFF', fontSize: 23, fontWeight: '700', marginTop: 15 },
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
    fontSize: 17,
    fontWeight: '400',
    marginBottom: 12,
    paddingHorizontal: 18,
  },
  sectionContent: {
    marginHorizontal: 18,
    borderRadius: 0,
    borderWidth: 0,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingVertical: 19,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,112,158,0.13)',
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
    fontSize: 18,
    fontWeight: '400',
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
    maxWidth: 110,
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
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
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
    borderRadius: 14,
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
    borderRadius: 14,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 24,
  },
});

export default SettingsScreen;
