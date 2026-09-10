/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A copy of a policy ready to be saved as a new one.
 *
 * Everything the cluster owns is stripped — identity, status, the annotations
 * the API server and the nmstate webhook write — leaving the desired state and
 * the selector, which is what someone duplicating a policy is after: the same
 * configuration aimed at another node. The name is suggested rather than
 * cleared so the dialog opens on something valid.
 */
export function duplicateOf(source: any, name: string): any {
  const copy = JSON.parse(JSON.stringify(source ?? {}));
  delete copy.status;

  const annotations = Object.fromEntries(
    Object.entries(copy.metadata?.annotations ?? {}).filter(
      ([key]) => !key.startsWith('kubectl.kubernetes.io/') && !key.startsWith('nmstate.io/')
    )
  );

  copy.metadata = { name: `${name}-copy`, labels: copy.metadata?.labels, annotations };
  if (!Object.keys(copy.metadata.annotations).length) delete copy.metadata.annotations;
  if (!copy.metadata.labels) delete copy.metadata.labels;
  return copy;
}
