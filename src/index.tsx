import './icons';
import {
  ApiProxy,
  registerRoute,
  registerSidebarEntry,
  registerSidebarEntryFilter,
} from '@kinvolk/headlamp-plugin/lib';
import React from 'react';
import ErrorBoundary from './components/common/ErrorBoundary';
import EnactmentDetails from './components/Enactments/Details';
import EnactmentList from './components/Enactments/List';
import Health from './components/Health/Health';
import NodeNetworkStateDetails from './components/NodeNetworkStates/Details';
import NodeNetworkStateList from './components/NodeNetworkStates/List';
import Overview from './components/Overview/Overview';
import PolicyDetails from './components/Policies/Details';
import PolicyList from './components/Policies/List';

/**
 * Whether the nmstate CRDs are present on this cluster.
 *
 * Starts true so the entries render immediately, and is only ever cleared when
 * the API group answers a definite 404. Any other failure — RBAC, a proxy
 * hiccup, an offline moment — leaves the plugin visible: hiding the UI on an
 * inconclusive probe strands the user with no way to reach a feature that may
 * well be installed, which is the worse outcome of the two.
 */
let nmstateAvailable = true;

async function detectNmstateCRDs() {
  try {
    await ApiProxy.request('/apis/nmstate.io/v1');
  } catch (error) {
    const status = (error as { status?: number })?.status;
    const message = String((error as Error)?.message ?? '');
    if (status === 404 || message.includes('404')) {
      nmstateAvailable = false;
      console.info('nmstate plugin: nmstate.io CRDs not found, hiding sidebar entries');
    } else {
      console.warn('nmstate plugin: CRD probe inconclusive, keeping entries visible', error);
    }
  }
}

detectNmstateCRDs();

interface ResourceRoute {
  /** Sidebar entry name, also used as the route's sidebar anchor. */
  name: string;
  label: string;
  path: string;
  icon: string;
  ListComponent: React.ComponentType;
  DetailsComponent: React.ComponentType;
  /** Route name used by Link, e.g. "nns". */
  detailsRouteName: string;
}

/** Registers a sidebar entry plus its list and details routes as one unit. */
function registerNmstateResource(config: ResourceRoute) {
  registerSidebarEntry({
    parent: 'nmstate',
    name: config.name,
    label: config.label,
    url: `/nmstate/${config.path}`,
    icon: config.icon,
  });

  registerRoute({
    path: `/nmstate/${config.path}`,
    sidebar: config.name,
    component: () => (
      <ErrorBoundary>
        <config.ListComponent />
      </ErrorBoundary>
    ),
    exact: true,
  });

  registerRoute({
    path: `/nmstate/${config.path}/:name`,
    sidebar: config.name,
    name: config.detailsRouteName,
    component: () => (
      <ErrorBoundary>
        <config.DetailsComponent />
      </ErrorBoundary>
    ),
    exact: true,
  });
}

registerSidebarEntry({
  parent: null,
  name: 'nmstate',
  label: 'NMState',
  url: '/nmstate/overview',
  icon: 'mdi:lan',
});

// Sidebar entries appear in registration order: overview, then the resources
// in the order an operator works through them, with health last.
registerSidebarEntry({
  parent: 'nmstate',
  name: 'nmstate-overview',
  label: 'Overview',
  url: '/nmstate/overview',
  icon: 'mdi:view-dashboard-outline',
});

registerRoute({
  path: '/nmstate/overview',
  sidebar: 'nmstate-overview',
  component: () => (
    <ErrorBoundary>
      <Overview />
    </ErrorBoundary>
  ),
  exact: true,
});

registerNmstateResource({
  name: 'nmstate-states',
  label: 'Node Network States',
  path: 'states',
  icon: 'mdi:graph-outline',
  ListComponent: NodeNetworkStateList,
  DetailsComponent: NodeNetworkStateDetails,
  detailsRouteName: 'nns',
});

registerNmstateResource({
  name: 'nmstate-policies',
  label: 'Policies',
  path: 'policies',
  icon: 'mdi:file-document-outline',
  ListComponent: PolicyList,
  DetailsComponent: PolicyDetails,
  detailsRouteName: 'nncp',
});

registerNmstateResource({
  name: 'nmstate-enactments',
  label: 'Enactments',
  path: 'enactments',
  icon: 'mdi:checkbox-marked-circle-outline',
  ListComponent: EnactmentList,
  DetailsComponent: EnactmentDetails,
  detailsRouteName: 'nnce',
});

registerSidebarEntry({
  parent: 'nmstate',
  name: 'nmstate-health',
  label: 'Health',
  url: '/nmstate/health',
  icon: 'mdi:heart-pulse',
});

registerRoute({
  path: '/nmstate/health',
  sidebar: 'nmstate-health',
  component: () => (
    <ErrorBoundary>
      <Health />
    </ErrorBoundary>
  ),
  exact: true,
});

// Hide the whole section when the CRDs are known to be absent. The filter reads
// the flag on every render rather than at registration time, so the entries
// disappear once the probe has concluded.
registerSidebarEntryFilter(entry =>
  !nmstateAvailable && String(entry.name).startsWith('nmstate') ? null : entry
);
