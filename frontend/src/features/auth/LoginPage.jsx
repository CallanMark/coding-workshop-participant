import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { canOpen, homePath, useAuth } from '../../context/auth';
import AuthCard from './AuthCard';

const PUBLIC_PATHS = ['/', '/login', '/register'];

/**
 * Check the form before submitting. The server returns one generic 401 for every failed
 * sign-in, so blank fields are caught here to give a clearer message.
 * @param {{email: string, password: string}} form
 * @returns {Object<string, string>} Field name → error message (empty when valid).
 */
function validate(form) {
  const errors = {};
  if (!form.email.trim()) errors.email = 'Enter your email address';
  if (!form.password) errors.password = 'Enter your password';
  return errors;
}

/**
 * Where to go after signing in: the page the user was sent here from if their role may open it
 * (someone else may have been signed out there), otherwise their home page.
 * @param {object | undefined} from - Location saved by RequireAuth.
 * @param {{role: string}} user - The signed-in user.
 * @returns {string}
 */
function destination(from, user) {
  if (!from || PUBLIC_PATHS.includes(from.pathname) || !canOpen(user, from.pathname)) return homePath(user);
  return `${from.pathname}${from.search || ''}`;
}

/**
 * Sign-in page, shown at / and /login. Signed-in users are sent straight on.
 */
export default function LoginPage() {
  const { user, login, notice } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from;
  if (user && !submitting) return <Navigate to={destination(from, user)} replace />;

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
      const signedIn = await login(form.email.trim(), form.password);
      navigate(destination(from, signedIn), { replace: true });
    } catch (error) {
      setFormError(error.message);
      setForm((prev) => ({ ...prev, password: '' }));
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Sign in"
      intro="Report and track facility incidents."
      switchText="New here?"
      switchLabel="Create an account"
      switchTo="/register"
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack spacing={2}>
          {notice && !formError && <Alert severity="info">{notice}</Alert>}
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField
            name="email"
            label="Email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={form.email}
            onChange={handleChange}
            error={Boolean(errors.email)}
            helperText={errors.email}
            disabled={submitting}
          />
          <TextField
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={handleChange}
            error={Boolean(errors.password)}
            helperText={errors.password}
            disabled={submitting}
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
