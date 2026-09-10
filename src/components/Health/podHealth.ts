import { KubeObject } from '@kinvolk/headlamp-plugin/lib/K8s/cluster';

export type HealthLevel = 'healthy' | 'degraded' | 'failed' | 'unknown';

export interface PodHealth {
  level: HealthLevel;
  /** Short reason, e.g. "CrashLoopBackOff" or "2/3 ready". */
  summary: string;
  restarts: number;
  readyContainers: number;
  totalContainers: number;
  node: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyPod = KubeObject & { jsonData?: any };
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Reduces a pod to the one line an operator needs.
 *
 * "Running" on its own hides the interesting cases, so a pod that is running
 * but restarting, or running with a container not ready, reports as degraded
 * rather than healthy — those are exactly the states worth chasing when the
 * network state on a node has stopped updating.
 */
export function podHealth(pod: AnyPod): PodHealth {
  const status = pod.jsonData?.status ?? {};
  const containers = status.containerStatuses ?? [];
  const restarts = containers.reduce(
    (n: number, c: { restartCount?: number }) => n + (c.restartCount ?? 0),
    0
  );
  const ready = containers.filter((c: { ready?: boolean }) => c.ready).length;
  const total = containers.length || (pod.jsonData?.spec?.containers ?? []).length;
  const node = pod.jsonData?.spec?.nodeName ?? '';

  const waiting = containers
    .map((c: { state?: { waiting?: { reason?: string } } }) => c.state?.waiting?.reason)
    .find(Boolean);
  const terminated = containers
    .map((c: { state?: { terminated?: { reason?: string } } }) => c.state?.terminated?.reason)
    .find(Boolean);

  const base = { restarts, readyContainers: ready, totalContainers: total, node };

  if (waiting) {
    const fatal = /CrashLoopBackOff|ImagePullBackOff|ErrImagePull|CreateContainerError/.test(
      waiting
    );
    return { ...base, level: fatal ? 'failed' : 'degraded', summary: waiting };
  }
  if (status.phase === 'Failed') {
    return { ...base, level: 'failed', summary: terminated || 'Failed' };
  }
  if (status.phase === 'Succeeded') {
    return { ...base, level: 'healthy', summary: 'Completed' };
  }
  if (status.phase === 'Pending') {
    return { ...base, level: 'degraded', summary: 'Pending' };
  }
  if (status.phase === 'Running') {
    if (total > 0 && ready < total) {
      return { ...base, level: 'degraded', summary: `${ready}/${total} ready` };
    }
    return { ...base, level: 'healthy', summary: 'Running' };
  }
  return { ...base, level: 'unknown', summary: status.phase || 'Unknown' };
}

export const HEALTH_COLOR: Record<HealthLevel, string> = {
  healthy: '#4caf50',
  degraded: '#ff9800',
  failed: '#f44336',
  unknown: '#9e9e9e',
};

export const HEALTH_ICON: Record<HealthLevel, string> = {
  healthy: 'mdi:check-circle-outline',
  degraded: 'mdi:alert-outline',
  failed: 'mdi:close-circle-outline',
  unknown: 'mdi:help-circle-outline',
};

/** The worst level present, used for the roll-up badges. */
export function worstLevel(levels: HealthLevel[]): HealthLevel {
  if (levels.includes('failed')) return 'failed';
  if (levels.includes('degraded')) return 'degraded';
  if (levels.includes('healthy')) return 'healthy';
  return 'unknown';
}
