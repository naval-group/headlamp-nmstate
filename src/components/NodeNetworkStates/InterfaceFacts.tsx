import { Box, Typography } from '@mui/material';
import React from 'react';
import { TopologyNode } from '../../nmstate/topology';
import { NmstateInterface } from '../../nmstate/types';

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <Box sx={{ display: 'flex', gap: 1, py: 0.35 }}>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 110, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ wordBreak: 'break-word' }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Fields worth promoting out of the raw YAML, per interface type. */
function typeSpecificRows(iface: NmstateInterface): React.ReactNode[] {
  const rows: React.ReactNode[] = [];

  const ports = iface.bridge?.port;
  if (ports?.length) {
    rows.push(
      <Row key="ports" label="Ports" value={ports.map(p => p.name).join(', ')} />,
      <Row
        key="stp"
        label="STP"
        value={
          (iface.bridge?.options as { stp?: { enabled?: boolean } })?.stp?.enabled
            ? 'enabled'
            : 'disabled'
        }
      />
    );
  }

  const bond = iface['link-aggregation'];
  if (bond) {
    rows.push(
      <Row key="mode" label="Bond mode" value={bond.mode} />,
      <Row key="bondports" label="Members" value={(bond.port ?? []).join(', ')} />
    );
  }

  if (iface.vlan) {
    rows.push(
      <Row key="vid" label="VLAN ID" value={iface.vlan.id} />,
      <Row key="vbase" label="Base interface" value={iface.vlan['base-iface']} />
    );
  }

  if (iface.vxlan) {
    rows.push(
      <Row key="vni" label="VNI" value={iface.vxlan.id} />,
      <Row key="xbase" label="Base interface" value={iface.vxlan['base-iface']} />,
      <Row key="local" label="Local" value={iface.vxlan.local} />,
      <Row key="remote" label="Remote" value={iface.vxlan.remote} />,
      <Row key="dport" label="UDP port" value={iface.vxlan['destination-port']} />
    );
  }

  if (iface.veth?.peer) rows.push(<Row key="peer" label="Peer" value={iface.veth.peer} />);
  if (iface.controller) rows.push(<Row key="ctrl" label="Controller" value={iface.controller} />);

  return rows;
}

/** The common fact list for an interface, shared by the side panel and the list view. */
export default function InterfaceFacts({ node }: { node: TopologyNode }) {
  return (
    <>
      <Row label="Type" value={node.type} />
      <Row label="State" value={node.state} />
      <Row label="MAC" value={node.mac} />
      <Row label="MTU" value={node.mtu} />
      {node.addresses.map(a => (
        <Row key={a} label="Address" value={<code>{a}</code>} />
      ))}
      {node.iface ? typeSpecificRows(node.iface) : null}
    </>
  );
}
