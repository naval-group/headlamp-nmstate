import { Icon } from '@iconify/react';
import { ApiProxy, K8s } from '@kinvolk/headlamp-plugin/lib';
import {
  DateLabel,
  Loader,
  SectionBox,
  SectionHeader,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Divider,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useEffect, useMemo, useState } from 'react';
import { NodeNetworkState } from '../../nmstate/resources';
import { HEALTH_COLOR, HEALTH_ICON, HealthLevel, podHealth, worstLevel } from './podHealth';

/**
 * Label selector matching every workload kubernetes-nmstate deploys.
 *
 * The operator labels itself `kubernetes-nmstate-operator` while the handler,
 * webhook, cert-manager and metrics pods all carry `kubernetes-nmstate`, so
 * both values are needed to see the whole stack.
 */
const NMSTATE_SELECTOR = 'app in (kubernetes-nmstate,kubernetes-nmstate-operator)';

/** Component ordering: the handler is what actually reads node state. */
const COMPONENT_ORDER = [
  'nmstate-handler',
  'nmstate-operator',
  'nmstate-webhook',
  'nmstate-cert-manager',
  'nmstate-metrics',
];

const COMPONENT_ROLE: Record<string, string> = {
  'nmstate-handler': 'Reads and applies network state on every node',
  'nmstate-operator': 'Reconciles the NMState custom resource',
  'nmstate-webhook': 'Validates and mutates policies on admission',
  'nmstate-cert-manager': 'Rotates the webhook certificates',
  'nmstate-metrics': 'Exposes Prometheus metrics',
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyResource = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

function HealthChip({ level, label }: { level: HealthLevel; label: string }) {
  return (
    <Chip
      size="small"
      icon={<Icon icon={HEALTH_ICON[level]} width={14} />}
      label={label}
      sx={{
        height: 22,
        color: HEALTH_COLOR[level],
        backgroundColor: alpha(HEALTH_COLOR[level], 0.16),
        borderLeft: `3px solid ${HEALTH_COLOR[level]}`,
        borderRadius: 0.5,
        '& .MuiChip-icon': { color: HEALTH_COLOR[level] },
      }}
    />
  );
}

export default function Health() {
  const [pods, podsError] = K8s.ResourceClasses.Pod.useList({
    labelSelector: NMSTATE_SELECTOR,
  });
  const [events, setEvents] = useState<AnyResource[]>([]);
  const [nnsList] = NodeNetworkState.useList();

  const namespace = pods?.[0]?.getNamespace() ?? '';

  /*
   * Events have no resource class in the plugin API, and the module that holds
   * one is not reachable from a plugin at runtime, so they are read straight
   * from the API. Scoping to the operator's namespace keeps the payload small.
   */
  useEffect(() => {
    if (!namespace) return;
    let cancelled = false;
    ApiProxy.request(`/api/v1/namespaces/${encodeURIComponent(namespace)}/events?limit=200`)
      .then(result => {
        if (!cancelled) setEvents(result?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [namespace]);

  /** Pods grouped by the component they belong to. */
  const components = useMemo(() => {
    const byComponent = new Map<string, AnyResource[]>();
    for (const pod of pods ?? []) {
      const name = pod.jsonData?.metadata?.labels?.name ?? 'other';
      if (!byComponent.has(name)) byComponent.set(name, []);
      byComponent.get(name)?.push(pod);
    }
    return [...byComponent.entries()].sort(
      (a, b) =>
        (COMPONENT_ORDER.indexOf(a[0]) + 1 || 99) - (COMPONENT_ORDER.indexOf(b[0]) + 1 || 99)
    );
  }, [pods]);

  /** Events touching the nmstate namespace, newest first. */
  const nmstateEvents = useMemo(() => {
    return [...events]
      .sort((a: AnyResource, b: AnyResource) =>
        String(b.lastTimestamp ?? b.eventTime ?? '').localeCompare(
          String(a.lastTimestamp ?? a.eventTime ?? '')
        )
      )
      .slice(0, 40);
  }, [events]);

  const eventsFor = (podName: string) =>
    nmstateEvents.filter((e: AnyResource) => e.involvedObject?.name === podName);

  if (podsError) {
    return (
      <SectionBox title="NMState Health" backLink>
        <Alert severity="error" variant="filled">
          Could not list the nmstate workloads: {String(podsError)}
        </Alert>
      </SectionBox>
    );
  }

  if (!pods) return <Loader title="Loading nmstate components" />;

  if (pods.length === 0) {
    return (
      <SectionBox title="NMState Health" backLink>
        <Alert severity="warning" variant="filled">
          No kubernetes-nmstate workloads found. The CRDs may be installed without the operator
          running, or its pods may live in a namespace this account cannot list.
        </Alert>
      </SectionBox>
    );
  }

  const overall = worstLevel((pods ?? []).map(p => podHealth(p).level));
  const unhealthy = (pods ?? []).filter(p => podHealth(p).level !== 'healthy');

  return (
    <>
      <SectionBox title="NMState Health" backLink>
        <Paper variant="outlined" sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <HealthChip
            level={overall}
            label={
              overall === 'healthy'
                ? `All ${pods.length} pods healthy`
                : `${unhealthy.length} of ${pods.length} pods need attention`
            }
          />
          {namespace && (
            <Chip
              size="small"
              icon={<Icon icon="mdi:folder-outline" width={14} />}
              label={namespace}
              sx={{ height: 22 }}
            />
          )}
          <Chip
            size="small"
            icon={<Icon icon="mdi:server-network" width={14} />}
            label={`${(nnsList ?? []).length} nodes reporting state`}
            sx={{ height: 22 }}
          />
        </Paper>
      </SectionBox>

      {components.map(([component, componentPods]) => {
        const level = worstLevel(componentPods.map(p => podHealth(p).level));
        return (
          <SectionBox
            key={component}
            title={
              <SectionHeader
                title={component}
                titleSideActions={[
                  <Box key="s" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <HealthChip level={level} label={`${componentPods.length} pod(s)`} />
                    <Typography variant="caption" color="text.secondary">
                      {COMPONENT_ROLE[component] ?? ''}
                    </Typography>
                  </Box>,
                ]}
              />
            }
          >
            {componentPods
              .sort((a, b) => a.getName().localeCompare(b.getName()))
              .map(pod => {
                const health = podHealth(pod);
                const podEvents = eventsFor(pod.getName());
                return (
                  <Accordion
                    key={pod.getName()}
                    disableGutters
                    variant="outlined"
                    sx={{
                      '&:before': { display: 'none' },
                      borderLeft: `4px solid ${HEALTH_COLOR[health.level]}`,
                      mb: 0.5,
                    }}
                  >
                    <AccordionSummary expandIcon={<Icon icon="mdi:chevron-down" width={20} />}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          width: '100%',
                          minWidth: 0,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Icon
                          icon={HEALTH_ICON[health.level]}
                          width={18}
                          color={HEALTH_COLOR[health.level]}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                          {pod.getName()}
                        </Typography>
                        {health.node && (
                          <Chip
                            size="small"
                            icon={<Icon icon="mdi:server" width={12} />}
                            label={health.node}
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {health.summary}
                        </Typography>
                        {health.restarts > 0 && (
                          <Tooltip title="Container restarts since the pod was created">
                            <Chip
                              size="small"
                              icon={<Icon icon="mdi:restart" width={12} />}
                              label={health.restarts}
                              sx={{
                                height: 18,
                                fontSize: '0.65rem',
                                color: health.restarts > 3 ? HEALTH_COLOR.degraded : undefined,
                              }}
                            />
                          </Tooltip>
                        )}
                        <Box sx={{ flex: 1 }} />
                        {podEvents.length > 0 && (
                          <Chip
                            size="small"
                            label={`${podEvents.length} event(s)`}
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
                        )}
                        <DateLabel date={pod.jsonData?.metadata?.creationTimestamp} />
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      {podEvents.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          No recent events for this pod.
                        </Typography>
                      ) : (
                        podEvents.map((e: AnyResource, i: number) => (
                          <Box key={i} sx={{ display: 'flex', gap: 1, py: 0.35 }}>
                            <Chip
                              size="small"
                              label={e.reason}
                              sx={{
                                height: 18,
                                fontSize: '0.65rem',
                                flexShrink: 0,
                                backgroundColor:
                                  e.type === 'Warning'
                                    ? alpha(HEALTH_COLOR.degraded, 0.2)
                                    : undefined,
                              }}
                            />
                            <Typography variant="caption" sx={{ flex: 1 }}>
                              {e.message}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ flexShrink: 0 }}
                            >
                              {e.lastTimestamp ? new Date(e.lastTimestamp).toLocaleString() : ''}
                            </Typography>
                          </Box>
                        ))
                      )}
                    </AccordionDetails>
                  </Accordion>
                );
              })}
          </SectionBox>
        );
      })}

      <SectionBox title="Recent events">
        {nmstateEvents.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No recent events involving the nmstate components.
          </Typography>
        ) : (
          nmstateEvents.slice(0, 20).map((e: AnyResource, i: number) => (
            <Box key={i}>
              <Box sx={{ display: 'flex', gap: 1, py: 0.5, alignItems: 'baseline' }}>
                <Chip
                  size="small"
                  label={e.reason}
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                    flexShrink: 0,
                    backgroundColor:
                      e.type === 'Warning' ? alpha(HEALTH_COLOR.degraded, 0.2) : undefined,
                  }}
                />
                <Typography variant="caption" sx={{ fontWeight: 600, flexShrink: 0 }}>
                  {e.involvedObject?.name}
                </Typography>
                <Typography variant="caption" sx={{ flex: 1 }}>
                  {e.message}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {e.lastTimestamp ? new Date(e.lastTimestamp).toLocaleString() : ''}
                </Typography>
              </Box>
              {i < nmstateEvents.length - 1 && <Divider />}
            </Box>
          ))
        )}
      </SectionBox>
    </>
  );
}
