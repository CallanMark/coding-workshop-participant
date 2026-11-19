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
import { CategorySelect, LocationFields } from '../facilities/FacilityFields';
import DuplicateSuggestions from './DuplicateSuggestions';

// The reporter is always the signed-in user (set by the server from the login token).
// Category and location are picked by name; the ids only travel to the API.
const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'medium',
  category_id: '',
  building_id: '',
  floor_id: '',
  seat_id: '',
};

/**
 * Check the form before submitting; mirrors the backend rules.
 * @param {object} form
 * @returns {Object<string, string>} Field name → error message (empty when valid).
 */
function validate(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = 'Title is required';
  if (!form.category_id) errors.category_id = 'Choose what kind of problem it is';
  if (!form.building_id) errors.building_id = 'Choose the building';
  return errors;
}

/**
 * The API payload: numbers for the chosen ids, optional fields left out when empty.
 * @param {object} form
 * @returns {object}
 */
function toPayload(form) {
  const payload = { title: form.title.trim(), priority: form.priority };
  if (form.description.trim()) payload.description = form.description.trim();
  ['category_id', 'building_id', 'floor_id', 'seat_id'].forEach((name) => {
    if (form[name] !== '') payload[name] = Number(form[name]);
  });
  return payload;
}

/**
 * Report-an-incident form with client and server validation.
 */
export default function IncidentCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const setFields = (fields) => {
    setForm((prev) => ({ ...prev, ...fields }));
    setErrors((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(fields).map((name) => [name, undefined])) }));
  };

  const handleChange = (event) => setFields({ [event.target.name]: event.target.value });

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
          <CategorySelect
            value={form.category_id}
            onChange={(id) => setFields({ category_id: id })}
            required
            error={errors.category_id}
          />
          <LocationFields
            value={{ building_id: form.building_id, floor_id: form.floor_id, seat_id: form.seat_id }}
            onChange={setFields}
            errors={errors}
          />
          <DuplicateSuggestions
            categoryId={form.category_id}
            buildingId={form.building_id}
            floorId={form.floor_id}
          />
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
