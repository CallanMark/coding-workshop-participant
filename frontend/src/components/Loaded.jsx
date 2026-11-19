/**
 * Loading spinner, error with retry, or the content once a useApiList result is ready.
 */
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';

/**
 * Loading spinner, error with retry, or `children(data)` once loaded.
 * @param {{result: {status: string, data: *, error: string, retry: function}, label: string,
 *   children: function(*): import('react').ReactNode}} props
 */
export default function Loaded({ result, label, children }) {
  if (result.status === 'error') {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={result.retry}>Retry</Button>}>
        {result.error}
      </Alert>
    );
  }
  if (result.status !== 'ready') {
    return <Stack sx={{ alignItems: 'center', py: 4 }}><CircularProgress aria-label={`Loading ${label}`} /></Stack>;
  }
  return children(result.data);
}

Loaded.propTypes = {
  result: PropTypes.shape({
    status: PropTypes.string.isRequired,
    data: PropTypes.any,
    error: PropTypes.string,
    retry: PropTypes.func.isRequired,
  }).isRequired,
  label: PropTypes.string.isRequired,
  children: PropTypes.func.isRequired,
};
