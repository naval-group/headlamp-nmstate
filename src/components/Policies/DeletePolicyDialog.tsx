import { Icon } from '@iconify/react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import React, { useMemo, useState } from 'react';
import { combinedImpact } from '../../nmstate/deletion';
import { NodeNetworkConfigurationPolicy } from '../../nmstate/resources';

type Policy = InstanceType<typeof NodeNetworkConfigurationPolicy>;

interface Props {
  /** Policies to delete; the dialog is open whenever this is non-empty. */
  policies: Policy[];
  onClose: () => void;
  onDeleted?: () => void;
}

/**
 * Confirms deleting policies, and says what deleting them will not do.
 *
 * Deleting a policy removes the request, not the result. nmstate only creates
 * and updates unless an interface is set to `absent`, so a bridge a policy
 * built stays on every node it was applied to, with nothing left in the cluster
 * describing it. That is the part worth spelling out at the moment of
 * deletion — by the time someone notices, the policy that explains the bridge
 * is gone.
 */
export default function DeletePolicyDialog({ policies, onClose, onDeleted }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [deleting, setDeleting] = useState(false);

  const impact = useMemo(() => combinedImpact(policies.map(p => p.desiredState)), [policies]);

  const open = policies.length > 0;
  const many = policies.length > 1;

  const handleDelete = async () => {
    setDeleting(true);
    let deleted = 0;
    const failed: string[] = [];

    for (const policy of policies) {
      try {
        await policy.delete();
        deleted++;
      } catch (error) {
        failed.push(`${policy.getName()}: ${(error as Error)?.message ?? 'failed'}`);
      }
    }

    setDeleting(false);
    if (deleted > 0) {
      enqueueSnackbar(`Deleted ${deleted} polic${deleted > 1 ? 'ies' : 'y'}`, {
        variant: 'success',
      });
    }
    if (failed.length > 0) {
      enqueueSnackbar(`Could not delete ${failed.length}: ${failed.join(', ')}`, {
        variant: 'error',
      });
    }
    // Close before notifying: the caller may navigate away, which unmounts this
    // dialog, and closing afterwards would set state on a gone component.
    onClose();
    onDeleted?.();
  };

  return (
    <Dialog open={open} onClose={deleting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Delete {many ? `${policies.length} policies` : policies[0]?.getName()}?
      </DialogTitle>
      <DialogContent>
        {many && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
            {policies.map(p => (
              <Chip key={p.getName()} size="small" label={p.getName()} />
            ))}
          </Box>
        )}

        {impact.lingering.length > 0 ? (
          <Alert severity="warning" variant="filled" sx={{ mb: 2 }}>
            <AlertTitle>The configuration stays on the nodes</AlertTitle>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Deleting {many ? 'these policies' : 'this policy'} removes the request, not the
              result. nmstate only creates and updates unless an interface is set to{' '}
              <strong>absent</strong>, so these stay configured on every node the{' '}
              {many ? 'policies were' : 'policy was'} applied to, with nothing left in the cluster
              describing them:
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {impact.lingering.map(name => (
                <Chip
                  key={name}
                  size="small"
                  icon={<Icon icon="mdi:lan" width={13} />}
                  label={name}
                  sx={{ height: 22, backgroundColor: 'rgba(0,0,0,0.2)' }}
                />
              ))}
            </Box>
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              To tear them down instead, set each interface to <strong>absent</strong>, let the
              {many ? ' policies apply' : ' policy apply'} once, and delete afterwards.
            </Typography>
          </Alert>
        ) : (
          <Alert severity="info" variant="filled" sx={{ mb: 2 }}>
            {impact.removing.length > 0
              ? `Every interface here is set to absent, so the configuration has already been torn down on the nodes. Deleting is tidy.`
              : `${
                  many ? 'These policies declare' : 'This policy declares'
                } nothing that stays configured on a node.`}
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary">
          The {many ? 'policies' : 'policy'} and {many ? 'their' : 'its'} enactments will be removed
          from the cluster. This cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={handleDelete}
          disabled={deleting}
          startIcon={
            deleting ? <CircularProgress size={16} /> : <Icon icon="mdi:delete" width={18} />
          }
        >
          Delete {many ? `all ${policies.length}` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
