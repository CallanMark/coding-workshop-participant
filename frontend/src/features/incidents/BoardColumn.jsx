import PropTypes from 'prop-types';
import { useDroppable } from '@dnd-kit/core';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { StatusChip } from '../../components/IncidentChips';
import { NEXT_STATUSES } from '../../constants';

/**
 * One status column on the board; a drop target for cards.
 * While a card is dragged, columns it can move to are highlighted and the rest are dimmed.
 * @param {{status: string, count: number, draggingFrom: (string|null), children: React.ReactNode}} props
 */
export default function BoardColumn({ status, count, draggingFrom, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const isDragging = draggingFrom !== null;
  const canDrop = isDragging && NEXT_STATUSES[draggingFrom].includes(status);
  const isSource = draggingFrom === status;

  let borderColor = 'divider';
  if (canDrop) borderColor = isOver ? 'primary.main' : 'primary.light';

  return (
    <Paper
      ref={setNodeRef}
      variant="outlined"
      sx={{
        flex: '1 0 240px',
        p: 1,
        bgcolor: isOver && canDrop ? 'action.hover' : 'background.paper',
        border: 2,
        borderStyle: canDrop ? 'dashed' : 'solid',
        borderColor,
        opacity: isDragging && !canDrop && !isSource ? 0.5 : 1,
        transition: 'opacity 120ms, border-color 120ms',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1, px: 0.5 }}>
        <StatusChip status={status} />
        <Typography variant="body2" color="text.secondary">{count}</Typography>
      </Stack>
      <Stack spacing={1} sx={{ minHeight: 80 }}>
        {children}
      </Stack>
    </Paper>
  );
}

BoardColumn.propTypes = {
  status: PropTypes.string.isRequired,
  count: PropTypes.number.isRequired,
  draggingFrom: PropTypes.string,
  children: PropTypes.node,
};
