import { useMemo } from 'react';
import { NodeNetworkConfigurationEnactment } from '../nmstate/resources';
import { Provenance } from '../nmstate/topology';

export interface ProvenanceInfo {
  provenance: Provenance;
  policy?: string;
  /** The error itself, short enough to sit in a tooltip. */
  failureMessage?: string;
  /** The whole apply log behind it. */
  failureDetail?: string;
}

/**
 * Maps each interface of a node to the policy that declares it, if any.
 *
 * The join runs off the enactments rather than the policies: a policy states an
 * intent for a set of nodes, while its enactment is the per-node record of what
 * actually happened, including the failure detail. Enactments carry the node and
 * policy as labels, so no name parsing is needed.
 */
export function useProvenance(
  enactments: NodeNetworkConfigurationEnactment[] | null,
  nodeName: string
): (name: string) => ProvenanceInfo {
  return useMemo(() => {
    const byInterface = new Map<string, ProvenanceInfo>();

    for (const enactment of enactments ?? []) {
      if (enactment.nodeName !== nodeName) continue;
      const failure = enactment.getFailure();
      const info: ProvenanceInfo = {
        provenance: failure.detail ? 'failing' : 'managed',
        policy: enactment.policyName,
        failureMessage: failure.summary || undefined,
        failureDetail: failure.detail || undefined,
      };
      for (const name of enactment.getManagedInterfaceNames()) {
        // A failing enactment wins: if two policies touch the same interface,
        // the broken one is the one worth surfacing.
        const existing = byInterface.get(name);
        if (!existing || (existing.provenance !== 'failing' && info.provenance === 'failing')) {
          byInterface.set(name, info);
        }
      }
    }

    return (name: string) => byInterface.get(name) ?? { provenance: 'observed' };
  }, [enactments, nodeName]);
}
