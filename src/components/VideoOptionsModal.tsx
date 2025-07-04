import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface VideoQuality {
  label: string;
  value: string;
  url: string;
}

export interface VideoOptionsProps {
  visible: boolean;
  onClose: () => void;
  
  // Qualité vidéo
  availableQualities: VideoQuality[];
  currentQuality: string;
  onQualityChange: (quality: VideoQuality) => void;
  
  // Vitesse de lecture
  currentSpeed: number;
  onSpeedChange: (speed: number) => void;
  
  // Lecture automatique
  autoPlay: boolean;
  onAutoPlayChange: (enabled: boolean) => void;
}

const VideoOptionsModal: React.FC<VideoOptionsProps> = ({
  visible,
  onClose,
  availableQualities,
  currentQuality,
  onQualityChange,
  currentSpeed,
  onSpeedChange,
  autoPlay,
  onAutoPlayChange,
}) => {
  const colorScheme = useColorScheme();
  
  const colors = {
    light: {
      background: '#ffffff',
      surface: '#f8fafc',
      text: '#1e293b',
      textSecondary: '#64748b',
      border: '#e2e8f0',
      primaryStart: '#219B9B',
      primaryEnd: '#0F6B7B',
      primary: '#0F6B7B',
      overlay: 'rgba(0, 0, 0, 0.5)',
    },
    dark: {
      background: '#1e293b',
      surface: '#334155',
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      border: '#475569',
      primaryStart: '#219B9B',
      primaryEnd: '#0F6B7B',
      primary: '#0F6B7B',
      overlay: 'rgba(0, 0, 0, 0.7)',
    },
  }[colorScheme ?? 'light'];

  const speedOptions = [
    { label: '0.5x', value: 0.5 },
    { label: '0.75x', value: 0.75 },
    { label: 'Normal', value: 1.0 },
    { label: '1.25x', value: 1.25 },
    { label: '1.5x', value: 1.5 },
    { label: '2x', value: 2.0 },
  ];

  const formatQualityLabel = (quality: VideoQuality) => {
    if (quality.value === 'auto') return 'Auto (Recommandé)';
    return quality.label;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              Options de lecture
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Lecture automatique */}
            <View style={[styles.section, { borderBottomColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="play-forward" size={20} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Lecture automatique
                </Text>
              </View>
              <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
                Passer automatiquement à l'épisode suivant
              </Text>
              <View style={styles.switchContainer}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>
                  Épisode suivant automatique
                </Text>
                <Switch
                  value={autoPlay}
                  onValueChange={onAutoPlayChange}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={autoPlay ? colors.background : colors.textSecondary}
                />
              </View>
            </View>

            {/* Vitesse de lecture */}
            <View style={[styles.section, { borderBottomColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="speedometer" size={20} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Vitesse de lecture
                </Text>
              </View>
              <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
                Ajuster la vitesse de la vidéo
              </Text>
              <View style={styles.optionsGrid}>
                {speedOptions.map((speed) => (
                  <TouchableOpacity
                    key={speed.value}
                    style={[
                      styles.optionButton,
                      {
                        backgroundColor: currentSpeed === speed.value ? colors.primary : colors.surface,
                        borderColor: colors.border,
                      }
                    ]}
                    onPress={() => onSpeedChange(speed.value)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        {
                          color: currentSpeed === speed.value ? colors.background : colors.text,
                          fontWeight: currentSpeed === speed.value ? '600' : '400',
                        }
                      ]}
                    >
                      {speed.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Qualité vidéo */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="settings" size={20} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Qualité vidéo
                </Text>
              </View>
              <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
                Choisir la résolution de la vidéo
              </Text>
              <View style={styles.qualityList}>
                {availableQualities.map((quality) => (
                  <TouchableOpacity
                    key={quality.value}
                    style={[
                      styles.qualityOption,
                      {
                        backgroundColor: currentQuality === quality.value ? colors.primary : 'transparent',
                        borderBottomColor: colors.border,
                      }
                    ]}
                    onPress={() => onQualityChange(quality)}
                  >
                    <Text
                      style={[
                        styles.qualityText,
                        {
                          color: currentQuality === quality.value ? colors.background : colors.text,
                          fontWeight: currentQuality === quality.value ? '600' : '400',
                        }
                      ]}
                    >
                      {formatQualityLabel(quality)}
                    </Text>
                    {currentQuality === quality.value && (
                      <Ionicons name="checkmark" size={20} color={colors.background} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '85%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    maxHeight: 500,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  sectionDescription: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    fontSize: 16,
    flex: 1,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 14,
  },
  qualityList: {
    gap: 2,
  },
  qualityOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderBottomWidth: 1,
  },
  qualityText: {
    fontSize: 16,
    flex: 1,
  },
});

export default VideoOptionsModal; 