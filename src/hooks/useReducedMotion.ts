import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// One accessibility subscription shared by all animated components. A new card
// receives the resolved value immediately instead of replaying when it resolves.
let reduced = true;
let subscription: ReturnType<typeof AccessibilityInfo.addEventListener> | null = null;
let generation = 0;
const listeners = new Set<() => void>();
const update = (value: boolean) => {
  if (reduced === value) return;
  reduced = value;
  listeners.forEach(listener => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!subscription) {
    const token = ++generation;
    subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (token === generation) update(value); }).catch(() => {});
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { generation++; subscription?.remove(); subscription = null; }
  };
};
export default function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => reduced, () => true);
}
