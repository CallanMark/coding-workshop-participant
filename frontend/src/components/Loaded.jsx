/**
 * Loading spinner, error with retry, or the content once a useApi result is ready.
 */
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';

/**
 * Loading spinner, error with retry, or `children(data)` once loaded.
 * @param {{result: {status: string, data: *, error: string, errorStatus?: number|null, retry: function},
 *   label: string, notFound?: import('react').ReactNode, children: function(*): import('react').ReactNode}} props
 *   notFound: shown instead of the error when the server answered 404 (e.g. "Incident not found").
 */
export default function Loaded({
  result, label, notFound, children,
}) {
  if (result.status === 'error' && notFound && result.errorStatus === 404) return notFound;
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
    errorStatus: PropTypes.number,
    retry: PropTypes.func.isRequired,
  }).isRequired,
  label: PropTypes.string.isRequired,
  notFound: PropTypes.node,
  children: PropTypes.func.isRequired,
};
