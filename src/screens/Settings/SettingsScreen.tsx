import { radii } from '../../theme/shape';
import downloadService from '../../services/downloadService';
import apiService from '../../services/apiService';
import { LANGUAGE_OPTIONS } from '../../services/preferences';
import { STREAM_HOSTS } from '../../services/streamHosts';
import * as mal from '../../services/mal/malService';
import * as malSync from '../../services/mal/malSync';
import * as updates from '../../services/updateService';
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
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MainTabScreenProps } from '../../types/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dialog } from '../../components/Dialog';

type SettingsScreenProps = MainTabScreenProps<'Settings'>;

const Colors = palette;

interface AppSettings {
  // MyAnimeList
  malEnabled: boolean;
  malUsername: string;
  malToken: string;

  // Lecture
  defaultQuality: string;
  preferredLanguage: string;
  /** Hébergeurs vidéo préférés, du plus au moins prioritaire. */
  favoriteHosts: string[];
  autoplay: boolean;
  /** Laisse la vidéo tourner quand l'app passe en arrière-plan (PiP pour le lecteur natif). */
  backgroundPlayback: boolean;
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
    preferredLanguage: 'vostfr',
    favoriteHosts: [],
    autoplay: true,
    backgroundPlayback: false,
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
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [showDownloadQualityModal, setShowDownloadQualityModal] = useState(false);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [profileName, setProfileName] = useState('Mon profil');
  const [profileDraft, setProfileDraft] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [storageUsed, setStorageUsed] = useState(0);
  const [malUser, setMalUser] = useState<string | null>(null);
  const [malBusy, setMalBusy] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');

  useEffect(() => { mal.getUser().then(user => setMalUser(user?.name ?? null)).catch(() => {}); }, []);

  const connectMal = async () => {
    if (!mal.isConfigured()) {
      dialog.alert('MyAnimeList', `Ajoutez le Client ID de votre application MAL dans le fichier .env de l’app (MAL_CLIENT_ID), puis relancez Expo.\n\nURL de redirection à déclarer sur myanimelist.net/apiconfig :\n${mal.redirectUri()}`);
      return;
    }
    setMalBusy('Connexion…');
    try {
      const name = await mal.connect();
      setMalUser(name);
      await saveSettings({ malEnabled: true, malUsername: name });
      dialog.alert('MyAnimeList', `Connecté en tant que ${name}. Voulez-vous importer votre liste maintenant ?`, [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Importer', onPress: () => void importMal() },
      ]);
    } catch (error) {
      if (!(error instanceof Error && error.message === 'Connexion annulée')) dialog.alert('MyAnimeList', error instanceof Error ? error.message : 'Connexion impossible.');
    } finally { setMalBusy(''); }
  };

  const importMal = async () => {
    setMalBusy('Import…');
    try {
      const result = await malSync.importList(text => setMalBusy(text));
      const missing = result.notFound.length ? `\n\n${result.notFound.length} absent(s) du catalogue : ${result.notFound.slice(0, 8).join(', ')}${result.notFound.length > 8 ? '…' : ''}` : '';
      dialog.alert('Import MyAnimeList', `${result.matched} anime retrouvés sur ${result.total} entrées, ${result.addedToWatchlist} ajoutés à la Watchlist.${missing}`);
    } catch (error) {
      dialog.alert('Import MyAnimeList', error instanceof Error ? error.message : 'Import impossible.');
    } finally { setMalBusy(''); }
  };

  const disconnectMal = () => dialog.alert('MyAnimeList', 'Se déconnecter ? Votre liste MAL n’est pas modifiée.', [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Se déconnecter', style: 'destructive', onPress: async () => { await mal.disconnect(); setMalUser(null); await saveSettings({ malEnabled: false, malUsername: '' }); } },
  ]);

  useEffect(() => {
    loadSettings();
    calculateStorageUsed();
    AsyncStorage.getItem('localProfileName').then(name => { if (name) setProfileName(name); }).catch(() => {});
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await AsyncStorage.getItem('appSettings');
      if (savedSettings) {
        // Les réglages enregistrés avant l'ajout d'une option gardent sa valeur par défaut.
        setSettings(previous => ({ ...previous, ...JSON.parse(savedSettings) }));
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
      dialog.alert('Erreur', 'Impossible de sauvegarder les paramètres');
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
    } catch { dialog.alert('Erreur', 'Impossible de sauvegarder le profil'); }
  };

  const checkUpdate = async () => {
    if (updateStatus) return;
    setUpdateStatus('Recherche…');
    try {
      const update = await updates.checkForUpdate();
      if (!update) dialog.alert('Mise à jour', `AnimeVision ${updates.currentVersion()} est la dernière version.`);
      else if (updates.canSelfUpdate()) updates.promptUpdate(update);
      else dialog.alert('Mise à jour', `La version ${update.version} est disponible. Elle s’installe depuis l’APK Android ; Expo Go se met à jour en relançant le serveur.`, [
        { text: 'Fermer', style: 'cancel' },
        { text: 'Voir sur GitHub', onPress: () => void Linking.openURL(update.pageUrl) },
      ]);
    } catch (error) {
      dialog.alert('Mise à jour', error instanceof Error ? error.message : 'Vérification impossible.');
    } finally { setUpdateStatus(''); }
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
    title: string,
    options: { value: string; label: string }[] = QUALITY_OPTIONS
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

          {options.map((option) => (
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

  const hostLabel = (id: string) => STREAM_HOSTS.find(host => host.id === id)?.label ?? id;
  // Liste ordonnée : la flèche remonte un favori d'un rang, le + ajoute un lecteur en fin de liste.
  const moveFavorite = (id: string, delta: number) => {
    const list = [...settings.favoriteHosts];
    const index = list.indexOf(id);
    if (index < 0) list.push(id);
    else if (delta === 0) list.splice(index, 1);
    else {
      const target = index + delta;
      if (target < 0 || target >= list.length) return;
      [list[index], list[target]] = [list[target], list[index]];
    }
    void saveSettings({ favoriteHosts: list });
  };

  const renderFavoritesModal = () => {
    const others = STREAM_HOSTS.filter(host => !settings.favoriteHosts.includes(host.id));
    const iconButton = (name: React.ComponentProps<typeof Ionicons>['name'], label: string, action: () => void, disabled = false) => (
      <TouchableOpacity accessibilityLabel={label} onPress={action} disabled={disabled} hitSlop={6} style={[styles.favoriteButton, disabled && { opacity: 0.25 }]}>
        <Ionicons name={name} size={20} color={colors.text} />
      </TouchableOpacity>
    );
    return (
      <Modal visible={showFavoritesModal} animationType={reducedMotion ? 'none' : 'slide'} transparent onRequestClose={() => setShowFavoritesModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, maxHeight: '85%' }]}>
            <Text style={[styles.modalTitle, { color: colors.textSecondary }]}>Lecteurs favoris</Text>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>À l’ouverture d’un épisode, le premier lecteur disponible de cette liste est choisi. Les autres suivent dans l’ordre de l’épisode.</Text>
            <ScrollView style={{ flexShrink: 1 }}>
              {settings.favoriteHosts.map((id, index) => (
                <View key={id} style={[styles.optionRow, { borderBottomColor: colors.border, backgroundColor: colors.primary + '20' }]}>
                  <Text style={[styles.optionText, { color: colors.primary, flex: 1 }]}>{index + 1}. {hostLabel(id)}</Text>
                  {iconButton('arrow-up', `Monter ${hostLabel(id)}`, () => moveFavorite(id, -1), index === 0)}
                  {iconButton('arrow-down', `Descendre ${hostLabel(id)}`, () => moveFavorite(id, 1), index === settings.favoriteHosts.length - 1)}
                  {iconButton('close', `Retirer ${hostLabel(id)} des favoris`, () => moveFavorite(id, 0))}
                </View>
              ))}
              {others.map(host => (
                <TouchableOpacity key={host.id} accessibilityLabel={`Ajouter ${host.label} aux favoris`} onPress={() => moveFavorite(host.id, 1)} style={[styles.optionRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.optionText, { color: colors.text, flex: 1 }]}>{host.label}</Text>
                  <Ionicons name="add" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.border, marginTop: 16, flex: 0 }]} onPress={() => setShowFavoritesModal(false)}>
              <Text style={[styles.modalButtonText, { color: colors.text }]}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

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
    <LinearGradient colors={['#8B5CF6', '#422767', colors.background]} locations={[0, 0.45, 1]} style={[styles.profileHeader, { paddingTop: insets.top + 20 }]}>
      <Text style={styles.pageTitle}>Mon compte</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Modifier mon profil" onPress={editProfile} style={styles.avatarButton}>
        <View style={styles.avatar}><Text style={styles.avatarInitial}>{profileName.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.editBadge}><Ionicons name="pencil-outline" size={21} color="#111" /></View>
      </TouchableOpacity>
      <Text style={styles.profileName}>{profileName}</Text>
    </LinearGradient>
  );

  return (
    // Pas de SafeAreaView (déprécié) : l'en-tête applique lui-même insets.top pour passer sous la barre d'état.
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
              'chatbubbles',
              'Version préférée',
              'Langue affichée par défaut sur les fiches',
              LANGUAGE_OPTIONS.find(option => option.value === settings.preferredLanguage)?.label,
              () => setShowLanguageModal(true)
            )}
            {renderSettingRow(
              'server',
              'Lecteurs favoris',
              'Utiliser en priorité le premier lecteur disponible de la liste',
              settings.favoriteHosts.length ? settings.favoriteHosts.map(id => hostLabel(id)).join(', ') : 'Aucun',
              () => setShowFavoritesModal(true)
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
              'tv',
              'Lecture en arrière-plan / Picture-in-Picture',
              'Continuer la lecture hors de l’app, en mini-lecteur (PiP) pour le lecteur natif. Les lecteurs web continuent seulement le son, sans PiP.',
              undefined,
              undefined,
              settings.backgroundPlayback,
              (value) => saveSettings({ backgroundPlayback: value })
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
        {renderSection('MyAnimeList', malUser ? (
          <>
            {renderSettingRow('person-circle', 'Compte MyAnimeList', 'Épisodes vus et Watchlist sont envoyés sur MAL', malUser)}
            {renderSettingRow(
              'sync',
              'Synchronisation automatique',
              'Met à jour MAL quand vous regardez un épisode',
              undefined,
              undefined,
              settings.malEnabled,
              (value) => saveSettings({ malEnabled: value })
            )}
            {renderSettingRow('download', 'Importer ma liste MAL', 'Watchlist et statuts depuis votre liste MAL', malBusy || undefined, malBusy ? undefined : importMal)}
            {renderSettingRow('log-out', 'Se déconnecter de MyAnimeList', undefined, undefined, malBusy ? undefined : disconnectMal, undefined, undefined, true)}
          </>
        ) : renderSettingRow(
          'link',
          'Se connecter à MyAnimeList',
          mal.isConfigured() ? 'Synchroniser votre progression et votre Watchlist' : 'Client ID MyAnimeList à configurer',
          malBusy || undefined,
          malBusy ? undefined : connectMal
        ))}

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
              () => dialog.alert('Info', 'Autres langues à venir')
            )}
          </>
        ))}

        {/* À propos */}
        {renderSection('À propos', (
          <>
            {renderSettingRow(
              'information-circle',
              'Rechercher une mise à jour',
              `AnimeVision v${updates.currentVersion()}`,
              updateStatus || undefined,
              checkUpdate
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
        showLanguageModal,
        () => setShowLanguageModal(false),
        settings.preferredLanguage,
        (value) => saveSettings({ preferredLanguage: value }),
        'Version préférée',
        LANGUAGE_OPTIONS
      )}

      {renderQualityModal(
        showDownloadQualityModal,
        () => setShowDownloadQualityModal(false),
        settings.downloadQuality,
        (value) => saveSettings({ downloadQuality: value }),
        'Qualité de téléchargement'
      )}

      {renderFavoritesModal()}
      {renderStorageModal()}
      {renderProfileModal()}
    </View>
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
    borderRadius: radii.panel,
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
  favoriteButton: {
    padding: 6,
    marginLeft: 4,
  },
  optionText: {
    fontSize: 16,
    flex: 1,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radii.control,
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
    borderRadius: radii.pill,
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
