import type { Activity } from './types';
import { wordSearch } from './word-search';

/** Every activity, in the order they appear on the home screen. Add new ones here. */
export const ACTIVITIES: readonly Activity[] = [wordSearch];

export function findActivity(id: string): Activity | undefined {
  return ACTIVITIES.find((a) => a.id === id);
}
