import { ApiProxy } from '@kinvolk/headlamp-plugin/lib';
import { useCallback, useState } from 'react';
import { FORCE_REFRESH_LABEL, nextRefreshValue } from '../nmstate/refreshLabel';
import { NodeNetworkState } from '../nmstate/resources';

/**
 * The API path for one NodeNetworkState.
 *
 * The name is escaped because it reaches here from the page's own URL: without
 * it, a crafted link could steer the PATCH this hook sends at an arbitrary
 * resource. It cannot exceed what the signed-in user may already do, but a link
 * should not be able to choose what the plugin writes to.
 */
const NNS_URL = (name: string) =>
  `/apis/nmstate.io/v1beta1/nodenetworkstates/${encodeURIComponent(name)}`;

/** Time to let the handler run nmstatectl and write the result back. */
const HANDLER_GRACE_MS = 3000;

export type RefreshOutcome =
  | { status: 'ok'; changed: boolean }
  | { status: 'forbidden' }
  | { status: 'error'; message: string };

/**
 * Re-reads a NodeNetworkState, optionally asking the handler to look again first.
 *
 * The handler only rewrites the object when the node's state actually differs
 * from what it last saw, so a forced refresh that changes nothing is the normal
 * outcome on a stable node — the caller is told whether anything moved so it can
 * say so rather than implying the refresh failed.
 *
 * The result is held here rather than remounting the view, so refreshing does
 * not discard the filters and layout the user set up.
 */
export function useNnsRefresh(nodeName: string) {
  const [snapshot, setSnapshot] = useState<NodeNetworkState | null>(null);
  const [busy, setBusy] = useState(false);

  const read = useCallback(async () => {
    const raw = await ApiProxy.request(NNS_URL(nodeName));
    return new NodeNetworkState(raw);
  }, [nodeName]);

  const refetch = useCallback(async (): Promise<RefreshOutcome> => {
    setBusy(true);
    try {
      const fresh = await read();
      setSnapshot(fresh);
      return { status: 'ok', changed: true };
    } catch (error) {
      return { status: 'error', message: String((error as Error)?.message ?? error) };
    } finally {
      setBusy(false);
    }
  }, [read]);

  const forceRefresh = useCallback(async (): Promise<RefreshOutcome> => {
    setBusy(true);
    try {
      const before = await read();
      await ApiProxy.patch(NNS_URL(nodeName), {
        metadata: { labels: { [FORCE_REFRESH_LABEL]: nextRefreshValue() } },
      });
      await new Promise(resolve => setTimeout(resolve, HANDLER_GRACE_MS));
      const after = await read();
      setSnapshot(after);
      return { status: 'ok', changed: after.lastUpdate !== before.lastUpdate };
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const message = String((error as Error)?.message ?? error);
      if (status === 403 || message.includes('403') || message.includes('Forbidden')) {
        return { status: 'forbidden' };
      }
      return { status: 'error', message };
    } finally {
      setBusy(false);
    }
  }, [nodeName, read]);

  return { snapshot, refetch, forceRefresh, busy };
}

/** Exposed for tests only. */
