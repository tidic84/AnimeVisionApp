import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export default function useReducedMotion() {
  // Respect accessibility before the asynchronous preference has resolved.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}
