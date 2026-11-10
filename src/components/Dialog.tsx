import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppColorScheme } from '../contexts/ThemeContext';
import useReducedMotion from '../hooks/useReducedMotion';
import { palette } from '../theme/palette';
import { radii } from '../theme/shape';
import { motion } from '../theme/tokens';

/** Fenêtres de l'app (dialogue centré et feuille d'actions) qui remplacent Alert.alert. */
type IconName = React.ComponentProps<typeof Ionicons>['name'];
export interface DialogButton<T = string> { text: string; style?: 'default' | 'cancel' | 'destructive'; value?: T; onPress?: () => void }
export interface DialogOptions<T = string> { title: string; message?: string; buttons?: DialogButton<T>[] }
export interface SheetAction<T = string> { label: string; value: T; icon?: IconName; style?: 'default' | 'destructive' }
export interface ActionsOptions<T = string> { title?: string; subtitle?: string; actions: SheetAction<T>[]; cancelLabel?: string }

type Choice = { value: unknown; onPress?: () => void } | null;
type Request = ({ kind: 'dialog'; options: DialogOptions<unknown> } | { kind: 'sheet'; options: ActionsOptions<unknown> }) & { id: number; resolve: (choice: Choice) => void };

let nextId = 0;
let host: ((request: Request) => void) | null = null;
const waiting: Request[] = [];
function open(request: Omit<Request, 'id' | 'resolve'>) {
  return new Promise<Choice>(resolve => {
    const full = { ...request, id: ++nextId, resolve } as Request;
    if (host) host(full); else waiting.push(full);
  });
}

export const dialog = {
  /** Résout avec la valeur du bouton choisi (son texte par défaut), null si annulé ou fermé. */
  async confirm<T = string>(options: DialogOptions<T>): Promise<T | null> {
    const choice = await open({ kind: 'dialog', options: options as DialogOptions<unknown> });
    choice?.onPress?.();
    return (choice?.value ?? null) as T | null;
  },
  /** Même signature qu'Alert.alert. */
  alert(title: string, message?: string, buttons?: DialogButton[]) {
    void dialog.confirm({ title, message, buttons });
  },
  async actions<T = string>(options: ActionsOptions<T>): Promise<T | null> {
    const choice = await open({ kind: 'sheet', options: options as ActionsOptions<unknown> });
    return (choice?.value ?? null) as T | null;
  },
};
export const useDialog = () => dialog;

export function DialogProvider({ children }: React.PropsWithChildren) {
  const [queue, setQueue] = useState<Request[]>([]);
  useEffect(() => {
    host = request => setQueue(previous => [...previous, request]);
    waiting.splice(0).forEach(host);
    return () => { host = null; };
  }, []);
  const current = queue[0];
  return <>
    {children}
    {current && <Surface key={current.id} request={current} onClosed={() => setQueue(previous => previous.slice(1))} />}
  </>;
}

function Surface({ request, onClosed }: { request: Request; onClosed: () => void }) {
  const colors = palette[useAppColorScheme()];
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const sheet = request.kind === 'sheet';
  const progress = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const [sheetHeight, setSheetHeight] = useState(0);
  const closing = useRef(false);
  const native = Platform.OS !== 'web';

  // Feuille : on attend sa hauteur pour la faire glisser exactement depuis le bas.
  useEffect(() => {
    if (sheet && !sheetHeight) return;
    if (reduced) { progress.setValue(1); return; }
    Animated.timing(progress, { toValue: 1, duration: sheet ? motion.duration.medium : motion.duration.short, easing: motion.easing.decelerate, useNativeDriver: native }).start();
  }, [sheet, sheetHeight, reduced, progress, native]);

  const close = (choice: Choice) => {
    if (closing.current) return;
    closing.current = true;
    request.resolve(choice);
    if (reduced) { onClosed(); return; }
    Animated.timing(progress, { toValue: 0, duration: sheet ? motion.duration.short : 150, easing: motion.easing.accelerate, useNativeDriver: native }).start(() => onClosed());
  };
  const dismiss = () => close(null);

  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80 || g.vy > 1) dismissRef.current();
      else Animated.spring(drag, { toValue: 0, useNativeDriver: native, bounciness: 0 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: native, bounciness: 0 }).start(),
  })).current;

  const scrim = <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: progress }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={dismiss} style={{ flex: 1 }} />
  </Animated.View>;

  let body: React.ReactNode;
  if (request.kind === 'sheet') {
    const { title, subtitle, actions, cancelLabel = 'Annuler' } = request.options;
    const translateY = Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight || height, 0] }), drag);
    body = <View style={styles.bottom} pointerEvents="box-none">
      <Animated.View {...pan.panHandlers} accessibilityViewIsModal onLayout={event => { if (!sheetHeight) setSheetHeight(event.nativeEvent.layout.height); }}
        style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8, transform: [{ translateY }] }, !sheetHeight && { opacity: 0 }]}>
        <View style={[styles.handle, { backgroundColor: colors.textTertiary }]} />
        {!!(title || subtitle) && <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          {!!title && <Text accessibilityRole="header" numberOfLines={2} style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>}
          {!!subtitle && <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
        </View>}
        {actions.map((action, index) => {
          const tint = action.style === 'destructive' ? colors.error : colors.text;
          return <Pressable key={index} accessibilityRole="button" onPress={() => close({ value: action.value })} android_ripple={{ color: colors.border }} style={({ pressed }) => [styles.row, pressed && Platform.OS === 'ios' && { backgroundColor: colors.surfaceElevated }]}>
            {action.icon && <Ionicons name={action.icon} size={22} color={tint} />}
            <Text style={[styles.rowLabel, { color: tint }]}>{action.label}</Text>
          </Pressable>;
        })}
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
        <Pressable accessibilityRole="button" onPress={dismiss} android_ripple={{ color: colors.border }} style={styles.row}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
          <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{cancelLabel}</Text>
        </Pressable>
      </Animated.View>
    </View>;
  } else {
    const { title, message, buttons = [{ text: 'OK' }] } = request.options;
    const scale = reduced ? 1 : progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
    body = <View style={styles.center} pointerEvents="box-none">
      <Animated.View accessibilityViewIsModal style={[styles.dialog, { width: Math.min(360, width - 48), maxHeight: height - insets.top - insets.bottom - 48, backgroundColor: colors.surface, opacity: progress, transform: [{ scale }] }]}>
        <Text accessibilityRole="header" style={[styles.dialogTitle, { color: colors.text }]}>{title}</Text>
        {!!message && <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 4 }}><Text style={[styles.dialogMessage, { color: colors.textSecondary }]}>{message}</Text></ScrollView>}
        <View style={styles.buttons}>
          {buttons.map((button, index) => {
            const cancel = button.style === 'cancel';
            const background = cancel ? 'transparent' : button.style === 'destructive' ? colors.error : colors.buttonBg;
            return <Pressable key={index} accessibilityRole="button" hitSlop={{ top: 2, bottom: 2 }} onPress={() => close({ value: cancel ? null : button.value ?? button.text, onPress: button.onPress })}
              style={({ pressed }) => [styles.button, { backgroundColor: background, opacity: pressed ? 0.75 : 1 }]}>
              <Text style={[styles.buttonText, { color: cancel ? colors.textSecondary : colors.buttonText }]}>{button.text}</Text>
            </Pressable>;
          })}
        </View>
      </Animated.View>
    </View>;
  }

  return <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent navigationBarTranslucent supportedOrientations={['portrait', 'landscape']}>
    {scrim}
    {body}
  </Modal>;
}

const styles = StyleSheet.create({
  bottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 640, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, opacity: 0.6, marginBottom: 8 },
  sheetHeader: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  sheetTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  sheetSubtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20 },
  rowLabel: { fontSize: 16, lineHeight: 22, flex: 1 },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dialog: { borderRadius: radii.sheet, paddingTop: 22, paddingHorizontal: 22, paddingBottom: 16, elevation: 8 },
  dialogTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700', marginBottom: 8 },
  dialogMessage: { fontSize: 14, lineHeight: 20 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap-reverse', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  button: { minHeight: 40, paddingHorizontal: 18, borderRadius: radii.pill, justifyContent: 'center' },
  buttonText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
