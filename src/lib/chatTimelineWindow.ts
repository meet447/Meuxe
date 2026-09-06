export const CHAT_TIMELINE_WINDOW = 60;

export function sliceWindow<T>(items: T[], windowSize: number): {
  visible: T[];
  hiddenCount: number;
} {
  if (windowSize <= 0 || items.length <= windowSize) {
    return { visible: items, hiddenCount: 0 };
  }
  return {
    visible: items.slice(items.length - windowSize),
    hiddenCount: items.length - windowSize,
  };
}

export function shouldShowEarlierControl(hiddenCount: number, totalCount: number, windowSize: number): boolean {
  return hiddenCount > 0 && totalCount > windowSize;
}
