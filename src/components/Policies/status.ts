/**
 * Colour for a policy or enactment condition type.
 *
 * NNCP and NNCE publish the same condition vocabulary, so both lists and the
 * topology badges share this mapping.
 */
export function policyStatusColor(status: string): string {
  switch (status) {
    case 'Available':
      return '#4caf50';
    case 'Failing':
    case 'Degraded':
      return '#f44336';
    case 'Progressing':
    case 'Pending':
      return '#2196f3';
    case 'Aborted':
      return '#ff9800';
    case 'Ignored':
      return '#9e9e9e';
    default:
      return '#bdbdbd';
  }
}
