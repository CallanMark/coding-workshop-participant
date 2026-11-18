import PropTypes from 'prop-types';
import { useDraggable } from '@dnd-kit/core';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { PriorityChip } from '../../components/IncidentChips';

const boardIncidentShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  priority: PropTypes.string.isRequired,
  reporter_id: PropTypes.number.isRequired,
  assignee_id: PropTypes.number,
  assignee_name: PropTypes.string,
  building_name: PropTypes.string,
  floor_name: PropTypes.string,
  seat_code: PropTypes.string,
  is_escalated: PropTypes.bool,
  blocked_reason: PropTypes.string,
});

/**
 * What a board card shows. Used both in the column and as the drag preview.
 * @param {{incident: object, userId: number}} props
 */
export function BoardCardContent({ incident, userId }) {
  const location = [incident.building_name, incident.floor_name, incident.seat_code]
    .filter(Boolean)
    .join(' · ');
  return (
    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }} gutterBottom>
        #{incident.id} {incident.title}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
        <PriorityChip priority={incident.priority} />
        {incident.reporter_id === userId && <Chip size="small" label="You reported" />}
        {incident.assignee_id === userId && <Chip size="small" label="Assigned to you" />}
        {incident.is_escalated && <Chip size="small" color="error" variant="outlined" label="Escalated" />}
      </Stack>
      <Typography variant="caption" color="text.secondary" component="p">{location}</Typography>
      <Typography variant="caption" color="text.secondary" component="p">
        {incident.assignee_name || 'Unassigned'}
      </Typography>
      {incident.status === 'blocked' && incident.blocked_reason && (
        <Typography variant="caption" color="error" component="p">
          Blocked: {incident.blocked_reason}
        </Typography>
      )}
    </CardContent>
  );
}

BoardCardContent.propTypes = {
  incident: boardIncidentShape.isRequired,
  userId: PropTypes.number.isRequired,
};

/**
 * A card that can be dragged to another status column (mouse, touch or keyboard).
 * @param {{incident: object, userId: number}} props
 */
export default function BoardCard({ incident, userId }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: incident.id });
  return (
    <Card
      ref={setNodeRef}
      variant="outlined"
      {...listeners}
      {...attributes}
      aria-label={`Incident ${incident.id}: ${incident.title}. Press space to pick up and move.`}
      sx={{ cursor: 'grab', opacity: isDragging ? 0.4 : 1, touchAction: 'manipulation' }}
    >
      <BoardCardContent incident={incident} userId={userId} />
    </Card>
  );
}

BoardCard.propTypes = {
  incident: boardIncidentShape.isRequired,
  userId: PropTypes.number.isRequired,
};
