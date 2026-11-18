import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { createIncident } from '../../api/incidents';
import { PRIORITIES } from '../../constants';
import { useCurrentUser } from '../../context/currentUser';

// TODO: building/floor/seat/category become dropdowns once the facilities API exists,
// and reporter_id is taken from the logged-in user once auth exists.
const ID_FIELDS = [
  { name: 'building_id', label: 'Building ID', required: true },
  { name: 'floor_id', label: 'Floor ID' },
  { name: 'seat_id', label: 'Seat ID' },
  { name: 'category_id', label: 'Category ID' },
  { name: 'reporter_id', label: 'Reporter (user) ID', required: true },
];

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'medium',
  building_id: '',
  floor_id: '',
  seat_id: '',
  category_id: '',
  reporter_id: '',
};

/**
 * Check the form before submitting; mirrors the backend rules.
 * @param {object} form
 * @returns {Object<string, string>} Field name → error message (empty when valid).
 */
function validate(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = 'Title is required';
  ID_FIELDS.forEach(({ name, label, required }) => {
    const value = form[name];
    if (required && value === '') errors[name] = `${label} is required`;
    else if (value !== '' && !/^[1-9]\d*$/.test(value)) errors[name] = 'Must be a positive whole number';
  });
  return errors;
}

/**
 * Convert form strings into the API payload (numbers for ids, omit empty optionals).
 * @param {object} form
 * @returns {object}
 */
function toPayload(form) {
  const payload = { title: form.title.trim(), priority: form.priority };
  if (form.description.trim()) payload.description = form.description.trim();
  ID_FIELDS.forEach(({ name }) => {
    if (form[name] !== '') payload[name] = Number(form[name]);
  });
  return payload;
}

/**
 * Report-an-incident form with client and server validation.
 */
export default function IncidentCreatePage() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, reporter_id: String(user.id) }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    const clientErrors = validate(form);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) return;

    setSaving(true);
    try {
      const incident = await createIncident(toPayload(form));
      navigate('/incidents', { state: { createdTitle: incident.title } });
    } catch (error) {
      setErrors(error.details || {});
      setFormError(error.message);
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 640, mx: 'auto' }}>
      <Typography variant="h5" component="h1" gutterBottom>Report an incident</Typography>
      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={2}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField
            name="title"
            label="Title"
            required
            value={form.title}
            onChange={handleChange}
            error={Boolean(errors.title)}
            helperText={errors.title}
          />
          <TextField
            name="description"
            label="Description"
            multiline
            minRows={3}
            value={form.description}
            onChange={handleChange}
          />
          <TextField
            name="priority"
            label="Priority"
            select
            value={form.priority}
            onChange={handleChange}
            error={Boolean(errors.priority)}
            helperText={errors.priority}
          >
            {Object.entries(PRIORITIES).map(([value, { label }]) => (
              <MenuItem key={value} value={value}>{label}</MenuItem>
            ))}
          </TextField>
          {ID_FIELDS.map(({ name, label, required }) => (
            <TextField
              key={name}
              name={name}
              label={label}
              required={required}
              value={form[name]}
              onChange={handleChange}
              error={Boolean(errors[name])}
              helperText={errors[name]}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            />
          ))}
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button component={RouterLink} to="/incidents" disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Saving…' : 'Report incident'}
            </Button>
          </Stack>
        </Stack>
      </form>
    </Paper>
  );
}
