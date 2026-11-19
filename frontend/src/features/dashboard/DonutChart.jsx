/**
 * A donut showing how one whole splits into a few parts, with the total in the middle and a legend
 * listing every part's count and share (so the numbers can be read without the colours).
 * Hovering a slice shows its value. Pass `legend={false}` only when something beside the chart
 * (e.g. a table with matching swatches) already names the parts.
 */
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { PieChart } from '@mui/x-charts/PieChart';
import { share } from './chartColors';

const SIZE = 180;

const sliceShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  color: PropTypes.string.isRequired,
});

/** A small colour square that ties a row to its slice. */
export function Swatch({ color }) {
  return <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: color, flexShrink: 0 }} />;
}

Swatch.propTypes = { color: PropTypes.string.isRequired };

function Legend({ slices, total }) {
  return (
    <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0, flexGrow: 1, width: '100%' }}>
      {slices.map((slice) => (
        <Stack
          component="li"
          key={slice.id}
          direction="row"
          spacing={1.25}
          sx={{ alignItems: 'center' }}
          aria-label={`${slice.label}: ${slice.value}`}
        >
          <Swatch color={slice.color} />
          <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap title={slice.label}>
            {slice.label}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{slice.value}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ width: 40, textAlign: 'right' }}>
            {share(slice.value, total)}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

Legend.propTypes = { slices: PropTypes.arrayOf(sliceShape).isRequired, total: PropTypes.number.isRequired };

/**
 * @param {{slices: Array<{id: *, label: string, value: number, color: string}>, totalLabel: string,
 *   emptyText: string, legend?: boolean}} props
 */
export default function DonutChart({
  slices, totalLabel, emptyText, legend = true,
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total === 0) return <Typography color="text.secondary">{emptyText}</Typography>;

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: 'center' }}>
      <Box sx={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
        <PieChart
          width={SIZE}
          height={SIZE}
          margin={0}
          hideLegend
          series={[{
            data: slices.filter((s) => s.value > 0).map(({
              id, label, value, color,
            }) => ({
              id, label, value, color,
            })),
            innerRadius: 58,
            outerRadius: 88,
            paddingAngle: 1.5,
            cornerRadius: 4,
            valueFormatter: ({ value }) => `${value} (${share(value, total)})`,
            highlightScope: { fade: 'global', highlight: 'item' },
          }]}
        />
        <Stack
          aria-hidden
          sx={{
            position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
          }}
        >
          <Typography variant="h4" component="span" sx={{ fontWeight: 600, lineHeight: 1 }}>{total}</Typography>
          <Typography variant="caption" color="text.secondary">{totalLabel}</Typography>
        </Stack>
      </Box>
      {legend && <Legend slices={slices} total={total} />}
    </Stack>
  );
}

DonutChart.propTypes = {
  slices: PropTypes.arrayOf(sliceShape).isRequired,
  totalLabel: PropTypes.string.isRequired,
  emptyText: PropTypes.string.isRequired,
  legend: PropTypes.bool,
};
