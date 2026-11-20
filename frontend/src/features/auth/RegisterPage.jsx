import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { homePath, useAuth } from '../../context/auth';
import AuthCard from './AuthCard';

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const ACME_EMAIL = /^[^@\s]+@acme\.inc$/i;

/**
 * Check the form before sending it, with the same rules as the server (which checks again).
 * @param {{name: string, email: string, password: string, confirm: string}} form
 * @returns {Object<string, string>} Field name → error message (empty when valid).
 */
function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Enter your name';
  if (!ACME_EMAIL.test(form.email.trim())) errors.email = 'Use your @acme.inc email address';
  if (form.password.length < MIN_PASSWORD || form.password.length > MAX_PASSWORD) {
    errors.password = `Use ${MIN_PASSWORD} to ${MAX_PASSWORD} characters`;
  }
  if (form.confirm !== form.password) errors.confirm = 'The passwords don’t match';
  return errors;
}

/**
 * Self-registration for ACME employees, at /register. The server only ever creates employee accounts here;
 * engineers, managers and admins are set up by the facility admin. On success the new employee is signed
 * in and taken to their incidents.
 */
export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user && !submitting) return <Navigate to={homePath(user)} replace />;

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

    setSubmitting(true);
    try {
      const signedIn = await register({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      navigate(homePath(signedIn), { replace: true });
    } catch (error) {
      // Field problems (e.g. "An account with this email already exists") go under the field.
      if (error.details && Object.keys(error.details).length > 0) setErrors(error.details);
      else setFormError(error.message);
      setSubmitting(false);
    }
  };

  const field = (name, label, props = {}) => (
    <TextField
      name={name}
      label={label}
      required
      value={form[name]}
      onChange={handleChange}
      error={Boolean(errors[name])}
      helperText={errors[name] || props.hint}
      disabled={submitting}
      type={props.type}
      autoComplete={props.autoComplete}
      autoFocus={props.autoFocus}
      slotProps={{ htmlInput: { maxLength: props.maxLength } }}
    />
  );

  return (
    <AuthCard
      title="Create an account"
      intro="For ACME employees: report problems in the office and follow them until they're fixed."
      switchText="Already have an account?"
      switchLabel="Sign in"
      switchTo="/login"
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={2}>
          {formError && <Alert severity="error">{formError}</Alert>}
          {field('name', 'Full name', { autoComplete: 'name', autoFocus: true, maxLength: 100 })}
          {field('email', 'Work email', {
            type: 'email', autoComplete: 'email', hint: 'Your @acme.inc address', maxLength: 254,
          })}
          {field('password', 'Password', {
            type: 'password', autoComplete: 'new-password', hint: `At least ${MIN_PASSWORD} characters`,
            maxLength: MAX_PASSWORD,
          })}
          {field('confirm', 'Confirm password', {
            type: 'password', autoComplete: 'new-password', maxLength: MAX_PASSWORD,
          })}
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
