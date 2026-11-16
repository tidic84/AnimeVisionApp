/**
 * Limite les rafraîchissements d'une progression (notification, écran) : un pas entier en %
 * n'est émis que s'il avance d'au moins `step` points depuis le dernier émis, plus 0 et 100.
 */
export function createProgressThrottle(step = 2) {
  let last = -1;
  return (fraction: number): number | null => {
    const percent = Math.max(0, Math.min(100, Math.floor(fraction * 100)));
    if (percent === last) return null;
    if (last >= 0 && percent < 100 && percent - last < step) return null;
    last = percent;
    return percent;
  };
}
