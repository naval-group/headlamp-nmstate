/**
 * Label the nmstate handler watches to re-read a node ahead of its schedule.
 *
 * It is a label on the NodeNetworkState — not an annotation, and not on the
 * Node. The handler's node controller watches NodeNetworkState updates and
 * reconciles when this label appears or changes, which is the same mechanism
 * the policy controller uses after applying a policy.
 */
export const FORCE_REFRESH_LABEL = 'nmstate.io/force-nns-refresh';

let counter = 0;

/**
 * A label value guaranteed to differ from the last one this session wrote.
 *
 * The handler reconciles when the label *changes*, not on any particular value,
 * so all that matters is never repeating one — a repeated value is a refresh
 * that silently does nothing.
 *
 * Upstream writes `time.Now().UnixNano()`. The browser only has milliseconds,
 * and multiplying by a million lands past Number.MAX_SAFE_INTEGER, giving a
 * float that merely looks like a nanosecond timestamp. The digits are appended
 * as text instead, and a counter breaks ties between two refreshes landing in
 * the same millisecond.
 */
export function nextRefreshValue(): string {
  counter += 1;
  return `${Date.now()}${String(counter % 1000000).padStart(6, '0')}`;
}
