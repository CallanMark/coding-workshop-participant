import { useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import ConfirmDialog from '../../components/ConfirmDialog';
import Loaded from '../../components/Loaded';
import FormDialog from '../../components/FormDialog';

/**
 * One facilities table (buildings, floors, seats or categories) with add, edit and delete.
 * The rows come from the parent's useApi result; after any change the list reloads.
 * @param {{noun: string, list: object, columns: {key: string, label: string, numeric?: boolean}[],
 *   fields: object[], nameOf: function(object): string, toForm: function(object|null): object,
 *   save: function(object, object|null): Promise<any>, remove: function(object): Promise<any>,
 *   emptyText: string}} props
 *   save gets the form values and the row being edited (null when adding).
 */
export default function FacilitySection({ noun, list, columns, fields, nameOf, toForm, save, remove, emptyText }) {
  const [dialog, setDialog] = useState(null); // { mode: 'add' | 'edit' | 'delete', row }
  const close = () => setDialog(null);
  const done = () => {
    setDialog(null);
    list.retry();
  };

  const table = (rows) => (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={`${noun}s`}>
        <TableHead>
          <TableRow>
            {columns.map((c) => <TableCell key={c.key} align={c.numeric ? 'right' : 'left'}>{c.label}</TableCell>)}
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} hover>
              {columns.map((c) => (
                <TableCell key={c.key} align={c.numeric ? 'right' : 'left'} sx={{ textTransform: c.key === 'type' ? 'capitalize' : 'none' }}>
                  {row[c.key] ?? '—'}
                </TableCell>
              ))}
              {/* Side by side on wider screens; stacked on phones so the table fits. */}
              <TableCell align="right" sx={{ whiteSpace: 'nowrap', '& .MuiButton-root': { minWidth: 0 } }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => setDialog({ mode: 'edit', row })} aria-label={`Edit ${nameOf(row)}`}>
                    Edit
                  </Button>
                  <Button size="small" color="error" onClick={() => setDialog({ mode: 'delete', row })} aria-label={`Delete ${nameOf(row)}`}>
                    Delete
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <Button variant="contained" onClick={() => setDialog({ mode: 'add', row: null })} disabled={list.status !== 'ready'}>
          Add {noun}
        </Button>
      </Stack>
      <Loaded result={list} label={`${noun}s`}>
        {(rows) => (rows.length === 0 ? <Typography color="text.secondary" sx={{ py: 2 }}>{emptyText}</Typography> : table(rows))}
      </Loaded>
      {dialog && dialog.mode !== 'delete' && (
        <FormDialog
          title={dialog.row ? `Edit ${nameOf(dialog.row)}` : `Add ${noun}`}
          fields={fields}
          initial={toForm(dialog.row)}
          onCancel={close}
          onSave={(values) => save(values, dialog.row).then(done)}
        />
      )}
      {dialog?.mode === 'delete' && (
        <ConfirmDialog
          title={`Delete ${nameOf(dialog.row)}?`}
          text="This can't be undone."
          confirmLabel="Delete"
          busyLabel="Deleting…"
          onCancel={close}
          onConfirm={() => remove(dialog.row).then(done)}
        />
      )}
    </Stack>
  );
}

FacilitySection.propTypes = {
  noun: PropTypes.string.isRequired,
  list: PropTypes.shape({
    status: PropTypes.string.isRequired,
    data: PropTypes.array.isRequired,
    error: PropTypes.string,
    retry: PropTypes.func.isRequired,
  }).isRequired,
  columns: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string, label: PropTypes.string, numeric: PropTypes.bool }))
    .isRequired,
  fields: PropTypes.array.isRequired,
  nameOf: PropTypes.func.isRequired,
  toForm: PropTypes.func.isRequired,
  save: PropTypes.func.isRequired,
  remove: PropTypes.func.isRequired,
  emptyText: PropTypes.string.isRequired,
};
