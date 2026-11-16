import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppColorScheme } from '../contexts/ThemeContext';
import { palette } from '../theme/palette';
import { radii } from '../theme/shape';
import { COMMENT_MAX, REPORT_REASONS, ReportError, ReportReason, ReportState, ReportTarget, recentReport, reportMessage, sendReport } from '../services/reportService';

type Props = {
  visible: boolean;
  onClose: () => void;
  target: ReportTarget;
  /** Ce qui est signalé, affiché sous le titre (« Frieren », « Frieren · E4 VOSTFR »). */
  subject: string;
  /** Motif présélectionné (ex. « Aucun lecteur ne marche » depuis un lecteur vide). */
  initialReason?: ReportReason;
  /** Les écrans de lecture restent en thème sombre. */
  dark?: boolean;
};

type Phase = { kind: 'checking' } | { kind: 'form' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'known'; state: ReportState };

/** Feuille « Signaler un problème » : motif, commentaire facultatif, puis « Merci, on va revérifier ». */
export default function ReportSheet({ visible, onClose, target, subject, initialReason, dark }: Props) {
  const scheme = useAppColorScheme();
  const colors = palette[dark ? 'dark' : scheme ?? 'dark'];
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [reason, setReason] = useState<ReportReason | null>(initialReason ?? null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const key = `${target.animeId}:${target.episodeId ?? ''}`;

  // À chaque ouverture : la cible a-t-elle déjà été signalée récemment (ici ou ailleurs) ?
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setPhase({ kind: 'checking' });
    setReason(initialReason ?? null);
    setComment('');
    setError('');
    recentReport(target).then(state => { if (active) setPhase(state ? { kind: 'known', state } : { kind: 'form' }); })
      .catch(() => { if (active) setPhase({ kind: 'form' }); });
    return () => { active = false; };
  }, [visible, key, initialReason]);

  const needsComment = reason === 'other';
  const canSend = !!reason && (!needsComment || comment.trim().length > 0) && phase.kind === 'form';
  const submit = async () => {
    if (!reason || !canSend) return;
    setError('');
    setPhase({ kind: 'sending' });
    try {
      const state = await sendReport(target, reason, comment);
      setPhase(state.alreadyReported ? { kind: 'known', state } : { kind: 'sent' });
    } catch (cause) {
      setError(cause instanceof ReportError ? cause.message : 'Le signalement n’a pas pu être envoyé. Réessayez plus tard.');
      setPhase({ kind: 'form' });
    }
  };

  const landscape = width > height;
  const doneView = (icon: React.ComponentProps<typeof Ionicons>['name'], title: string, message: string) => <View style={styles.done}>
    <Ionicons name={icon} size={44} color={colors.primary} />
    <Text accessibilityRole="header" style={[styles.doneTitle, { color: colors.text }]}>{title}</Text>
    <Text style={[styles.doneMessage, { color: colors.textSecondary }]}>{message}</Text>
    <Pressable accessibilityRole="button" onPress={onClose} style={[styles.send, { backgroundColor: colors.buttonBg, alignSelf: 'stretch' }]}><Text style={[styles.sendText, { color: colors.buttonText }]}>Fermer</Text></Pressable>
  </View>;

  let body: React.ReactNode;
  if (phase.kind === 'checking') body = <ActivityIndicator accessibilityLabel="Vérification des signalements" color={colors.primary} style={{ paddingVertical: 48 }} />;
  else if (phase.kind === 'sent') body = doneView('checkmark-circle', 'Merci, on va revérifier', 'Votre signalement a été envoyé. Les lecteurs et les informations de ce contenu seront récupérés à nouveau dans les prochaines heures.');
  else if (phase.kind === 'known') { const { title, message } = reportMessage(phase.state); body = doneView(phase.state.status === 'done' ? 'checkmark-done-circle' : 'time-outline', title, message); }
  else body = <>
    {REPORT_REASONS.map(option => {
      const selected = reason === option.value;
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${option.label}, ${option.hint}`} onPress={() => setReason(option.value)} style={[styles.reason, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.accentSoft : 'transparent' }]}>
        <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.primary : colors.textSecondary} />
        <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 15, fontWeight: selected ? '600' : '400' }}>{option.label}</Text><Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{option.hint}</Text></View>
      </Pressable>;
    })}
    <TextInput value={comment} onChangeText={setComment} maxLength={COMMENT_MAX} multiline accessibilityLabel={needsComment ? 'Description du problème, obligatoire' : 'Commentaire facultatif'}
      placeholder={needsComment ? 'Décrivez le problème (obligatoire)' : 'Commentaire (facultatif)'} placeholderTextColor={colors.textTertiary}
      style={[styles.comment, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
    {!!error && <Text accessibilityLiveRegion="polite" style={{ color: colors.error, marginTop: 10, lineHeight: 20 }}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSend, busy: phase.kind === 'sending' }} disabled={!canSend} onPress={() => void submit()} style={[styles.send, { backgroundColor: colors.buttonBg, opacity: canSend || phase.kind === 'sending' ? 1 : 0.45 }]}>
      {phase.kind === 'sending' ? <ActivityIndicator color={colors.buttonText} /> : <Text style={[styles.sendText, { color: colors.buttonText }]}>Envoyer le signalement</Text>}
    </Pressable>
  </>;

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent supportedOrientations={['portrait', 'landscape']}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Fermer le signalement" onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(16, insets.bottom) }, landscape && { width: Math.min(560, width - insets.left - insets.right - 32) }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Signaler un problème</Text>
            <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{subject}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} hitSlop={8} style={{ padding: 8 }}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
        </View>
        <ScrollView style={{ maxHeight: height * (landscape ? 0.75 : 0.7) }} keyboardShouldPersistTaps="handled">{body}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 640, paddingHorizontal: 20, paddingTop: 12, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 19, fontWeight: '700' },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: radii.control, marginBottom: 8 },
  comment: { minHeight: 76, maxHeight: 140, borderWidth: 1, borderRadius: radii.control, padding: 12, marginTop: 4, textAlignVertical: 'top', fontSize: 14 },
  send: { minHeight: 48, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  sendText: { fontSize: 15, fontWeight: '700' },
  done: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  doneTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  doneMessage: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
