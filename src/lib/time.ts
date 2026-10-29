let offsetMs = 0;

export function syncServerTime(serverIso: string | null | undefined): void {
  if (!serverIso) return;
  const value = new Date(serverIso).getTime();
  if (Number.isNaN(value)) return;
  offsetMs = value - Date.now();
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function serverOffset(): number {
  return offsetMs;
}
