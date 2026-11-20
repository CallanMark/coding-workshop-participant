/**
 * Dialogs for the engineers admin page, built on the shared FormDialog and ConfirmDialog:
 * create or edit an engineer, and confirm deactivating or reactivating one.
 */
import PropTypes from 'prop-types';
import ConfirmDialog from '../../components/ConfirmDialog';
import FormDialog from '../../components/FormDialog';

const MIN_PASSWORD = 8;

const engineerShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  team_id: PropTypes.number,
  is_active: PropTypes.bool,
});

/**
 * Create an engineer (name, email, temporary password, team) or edit one (name, team).
 * onSave gets only what to send: everything when creating, just the changed fields when editing.
 * @param {{engineer?: object, teams: Array<{id: number, name: string}>, teamId?: number,
 *   onCancel: function(): void, onSave: function(object): Promise<void>}} props - onSave rejects with an ApiError.
 */
export function EngineerFormDialog({
  engineer, teams, teamId, onCancel, onSave,
}) {
  const creating = !engineer;
  const fields = [
    { name: 'name', label: 'Name' },
    ...(creating ? [
      { name: 'email', label: 'Email', type: 'email' },
      {
        name: 'password',
        label: 'Temporary password',
        minLength: MIN_PASSWORD,
        autoComplete: 'new-password',
        helperText: `At least ${MIN_PASSWORD} characters. Share it with them so they can sign in.`,
      },
    ] : []),
    { name: 'team_id', label: 'Team', options: teams.map((t) => ({ value: String(t.id), label: t.name })) },
  ];
  const initial = {
    name: engineer?.name ?? '',
    email: '',
    password: '',
    team_id: String(engineer?.team_id ?? teamId ?? ''),
  };

  const save = async (values) => {
    const body = {
      name: values.name.trim(),
      team_id: Number(values.team_id),
      ...(creating && { email: values.email.trim(), password: values.password }),
    };
    if (creating) return onSave(body);
    const changed = Object.fromEntries(Object.entries(body).filter(([key, value]) => value !== engineer[key]));
    return Object.keys(changed).length ? onSave(changed) : onCancel();
  };

  return (
    <FormDialog
      title={creating ? 'Add engineer' : `Edit ${engineer.name}`}
      submitLabel={creating ? 'Add' : 'Save'}
      fields={fields}
      initial={initial}
      onCancel={onCancel}
      onSave={save}
    />
  );
}

EngineerFormDialog.propTypes = {
  engineer: engineerShape,
  teams: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string })).isRequired,
  teamId: PropTypes.number,
  onCancel: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

/**
 * Confirm deactivating (can't sign in or be assigned; history kept) or reactivating an engineer.
 * The server refuses to deactivate someone still holding open incidents; that message shows here.
 * @param {{engineer: object, onCancel: function(): void, onConfirm: function(): Promise<void>}} props
 */
export function EngineerStatusDialog({ engineer, onCancel, onConfirm }) {
  const deactivating = engineer.is_active;
  return (
    <ConfirmDialog
      title={`${deactivating ? 'Deactivate' : 'Reactivate'} ${engineer.name}?`}
      text={deactivating
        ? 'They won’t be able to sign in or be assigned incidents. Their history is kept, and you can reactivate them later.'
        : 'They’ll be able to sign in and be assigned incidents again.'}
      confirmLabel={deactivating ? 'Deactivate' : 'Reactivate'}
      busyLabel={deactivating ? 'Deactivating…' : 'Reactivating…'}
      color={deactivating ? 'error' : 'primary'}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

EngineerStatusDialog.propTypes = {
  engineer: engineerShape.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};
