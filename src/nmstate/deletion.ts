import { NmstateState } from './types';

/**
 * What is left behind when a policy is deleted.
 *
 * Deleting a NodeNetworkConfigurationPolicy removes the request, not the
 * result: nmstate only ever creates and updates unless an interface is set to
 * `absent`, so a bridge created by a policy outlives the policy that created
 * it. Saying so at the point of deletion is the difference between a tidy
 * cluster and one carrying configuration nothing accounts for any more.
 */
export interface DeletionImpact {
  /** Interfaces that stay configured on the nodes once the policy is gone. */
  lingering: string[];
  /** Interfaces the policy asks to remove, so deleting it afterwards is tidy. */
  removing: string[];
  /** Interfaces the policy explicitly leaves alone; deleting changes nothing. */
  ignored: string[];
  /** True when nothing is left behind. */
  clean: boolean;
}

export function deletionImpact(desiredState: NmstateState | undefined): DeletionImpact {
  const interfaces = desiredState?.interfaces ?? [];
  const lingering: string[] = [];
  const removing: string[] = [];
  const ignored: string[] = [];

  for (const iface of interfaces) {
    if (!iface?.name) continue;
    // `up` is nmstate's default when no state is given, so an entry without one
    // is a configured interface just like an explicit `up`.
    const state = iface.state ?? 'up';
    if (state === 'absent') removing.push(iface.name);
    else if (state === 'ignore') ignored.push(iface.name);
    else lingering.push(iface.name);
  }

  return { lingering, removing, ignored, clean: lingering.length === 0 };
}

/** The impact of deleting several policies at once. */
export function combinedImpact(states: (NmstateState | undefined)[]): DeletionImpact {
  const all = states.map(deletionImpact);
  return {
    lingering: [...new Set(all.flatMap(i => i.lingering))],
    removing: [...new Set(all.flatMap(i => i.removing))],
    ignored: [...new Set(all.flatMap(i => i.ignored))],
    clean: all.every(i => i.clean),
  };
}
