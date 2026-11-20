import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import { availabilityLabel } from '../constants';

/**
 * Whether an engineer can take work right now.
 * @param {{available: boolean}} props
 */
export function AvailabilityChip({ available }) {
  return <Chip size="small" variant="outlined" color={available ? 'success' : 'default'} label={availabilityLabel(available)} />;
}

AvailabilityChip.propTypes = { available: PropTypes.bool.isRequired };

/**
 * Whether an account can sign in (deactivated accounts keep their history).
 * @param {{active: boolean}} props
 */
export function ActiveChip({ active }) {
  return <Chip size="small" variant="outlined" color={active ? 'success' : 'default'} label={active ? 'Active' : 'Deactivated'} />;
}

ActiveChip.propTypes = { active: PropTypes.bool.isRequired };
