import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import { PRIORITIES, STATUSES } from '../constants';

/**
 * Coloured chip for an incident status.
 * @param {{status: string}} props
 */
export function StatusChip({ status }) {
  const { label, color } = STATUSES[status] || { label: status, color: 'default' };
  return <Chip size="small" label={label} color={color} />;
}

StatusChip.propTypes = {
  status: PropTypes.string.isRequired,
};

/**
 * Coloured outlined chip for an incident priority.
 * @param {{priority: string}} props
 */
export function PriorityChip({ priority }) {
  const { label, color } = PRIORITIES[priority] || { label: priority, color: 'default' };
  return <Chip size="small" variant="outlined" label={label} color={color} />;
}

PriorityChip.propTypes = {
  priority: PropTypes.string.isRequired,
};

/** The "Escalated" flag on an incident, styled the same everywhere. */
export function EscalatedChip() {
  return <Chip size="small" color="error" label="Escalated" />;
}
