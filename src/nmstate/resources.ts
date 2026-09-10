import { KubeObject } from '@kinvolk/headlamp-plugin/lib/K8s/cluster';
import { NmstateFailure, parseFailure, retriesFor } from './failure';
import { NmstateCondition, NmstateState } from './types';

/**
 * Returns the single condition whose status is "True".
 *
 * NNCP and NNCE always publish the full set of condition types with exactly
 * one set to True, so this is the resource's effective status.
 */
function activeCondition(conditions: NmstateCondition[] | undefined): NmstateCondition | null {
  return (conditions || []).find(c => c.status === 'True') || null;
}

/**
 * NodeNetworkConfigurationPolicy — the desired network configuration.
 * Cluster-scoped, served as v1 (storage) and v1beta1.
 */
export class NodeNetworkConfigurationPolicy extends KubeObject {
  static kind = 'NodeNetworkConfigurationPolicy';
  static apiVersion = 'nmstate.io/v1';
  static isNamespaced = false;
  static apiName = 'nodenetworkconfigurationpolicies';
  static apiPlural = 'nodenetworkconfigurationpolicies';

  static get detailsRoute() {
    return 'nncp';
  }

  get spec() {
    return this.jsonData?.spec ?? {};
  }

  get status() {
    return this.jsonData?.status ?? {};
  }

  get desiredState(): NmstateState {
    return this.spec?.desiredState ?? {};
  }

  get nodeSelector(): Record<string, string> {
    return this.spec?.nodeSelector ?? {};
  }

  get conditions(): NmstateCondition[] {
    return this.status?.conditions ?? [];
  }

  /** Effective status, e.g. "Available", "Degraded", "Ignored". */
  getStatus(): string {
    return activeCondition(this.conditions)?.type ?? 'Unknown';
  }

  getReason(): string {
    return activeCondition(this.conditions)?.reason ?? '';
  }

  getMessage(): string {
    return activeCondition(this.conditions)?.message ?? '';
  }

  /** Interface names this policy declares, used to mark managed nodes on the topology. */
  getManagedInterfaceNames(): string[] {
    return (this.desiredState.interfaces ?? []).map(i => i.name).filter(Boolean);
  }
}

/**
 * NodeNetworkState — the observed network state of one node.
 *
 * Read-only, one per node, owned by the Node object. The handler refreshes it
 * periodically with jitter, so it is an eventually-consistent snapshot rather
 * than live truth: always surface `lastSuccessfulUpdateTime` alongside it.
 */
export class NodeNetworkState extends KubeObject {
  static kind = 'NodeNetworkState';
  static apiVersion = 'nmstate.io/v1beta1';
  static isNamespaced = false;
  static apiName = 'nodenetworkstates';
  static apiPlural = 'nodenetworkstates';

  static get detailsRoute() {
    return 'nns';
  }

  get status() {
    return this.jsonData?.status ?? {};
  }

  get currentState(): NmstateState {
    return this.status?.currentState ?? {};
  }

  get interfaces() {
    return this.currentState.interfaces ?? [];
  }

  get routes() {
    return this.currentState.routes?.running ?? [];
  }

  get dnsServers(): string[] {
    return this.currentState['dns-resolver']?.running?.server ?? [];
  }

  get dnsSearch(): string[] {
    return this.currentState['dns-resolver']?.running?.search ?? [];
  }

  get lastUpdate(): string {
    return this.status?.lastSuccessfulUpdateTime ?? '';
  }

  get nmstateVersion(): string {
    return this.status?.handlerNmstateVersion ?? '';
  }

  get networkManagerVersion(): string {
    return this.status?.hostNetworkManagerVersion ?? '';
  }

  /** Age of the snapshot in seconds, or null when never reported. */
  getSnapshotAgeSeconds(): number | null {
    if (!this.lastUpdate) return null;
    const t = Date.parse(this.lastUpdate);
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.round((Date.now() - t) / 1000));
  }
}

/**
 * NodeNetworkConfigurationEnactment — per-node result of applying a policy.
 *
 * Named `<node>.<policy>`, but the labels nmstate.io/node and nmstate.io/policy
 * are the reliable join keys.
 */
export class NodeNetworkConfigurationEnactment extends KubeObject {
  static kind = 'NodeNetworkConfigurationEnactment';
  static apiVersion = 'nmstate.io/v1beta1';
  static isNamespaced = false;
  static apiName = 'nodenetworkconfigurationenactments';
  static apiPlural = 'nodenetworkconfigurationenactments';

  static get detailsRoute() {
    return 'nnce';
  }

  get status() {
    return this.jsonData?.status ?? {};
  }

  get conditions(): NmstateCondition[] {
    return this.status?.conditions ?? [];
  }

  get desiredState(): NmstateState {
    return this.status?.desiredState ?? {};
  }

  get nodeName(): string {
    return this.jsonData?.metadata?.labels?.['nmstate.io/node'] ?? '';
  }

  get policyName(): string {
    return this.jsonData?.metadata?.labels?.['nmstate.io/policy'] ?? '';
  }

  get policyGeneration(): number | null {
    return this.status?.policyGeneration ?? null;
  }

  get features(): string[] {
    return this.status?.features ?? [];
  }

  getStatus(): string {
    return activeCondition(this.conditions)?.type ?? 'Unknown';
  }

  getReason(): string {
    return activeCondition(this.conditions)?.reason ?? '';
  }

  /** The raw apply log nmstate returned, in full. */
  getFailureMessage(): string {
    const failing = this.conditions.find(c => c.type === 'Failing' && c.status === 'True');
    return failing?.message ?? '';
  }

  /**
   * The failure, split into the error and the log it was buried in.
   *
   * nmstate returns its whole apply output, most of which is one INFO line per
   * interface it ignored, so the error has to be lifted out before it is shown
   * anywhere someone is scanning rather than reading.
   */
  getFailure(): NmstateFailure {
    return parseFailure(this.getFailureMessage());
  }

  /** How many times the handler has retried the generation being applied. */
  getRetries(): number {
    return retriesFor(this.status?.retryCount, this.policyGeneration);
  }

  getManagedInterfaceNames(): string[] {
    return (this.desiredState.interfaces ?? []).map(i => i.name).filter(Boolean);
  }
}

/** The nmstate operator CR, normally a singleton named "nmstate". */
export class NMState extends KubeObject {
  static kind = 'NMState';
  static apiVersion = 'nmstate.io/v1';
  static isNamespaced = false;
  static apiName = 'nmstates';
  static apiPlural = 'nmstates';

  static get detailsRoute() {
    return 'nmstate-operator';
  }
}
