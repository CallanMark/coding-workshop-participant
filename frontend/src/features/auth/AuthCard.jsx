import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

/**
 * The centred card the sign-in and register pages share: brand, heading, intro, the form, and a link to
 * the other page underneath.
 * @param {{title: string, intro: string, children: React.ReactNode,
 *   switchText: string, switchLabel: string, switchTo: string}} props
 */
export default function AuthCard({
  title, intro, children, switchText, switchLabel, switchTo,
}) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2,
      }}
    >
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, width: '100%', maxWidth: 420 }}>
        <Typography variant="overline" color="primary">ACME Facilities</Typography>
        <Typography variant="h5" component="h1" gutterBottom>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{intro}</Typography>
        {children}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
          {switchText}{' '}
          <Link component={RouterLink} to={switchTo}>{switchLabel}</Link>
        </Typography>
      </Paper>
    </Box>
  );
}

AuthCard.propTypes = {
  title: PropTypes.string.isRequired,
  intro: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  switchText: PropTypes.string.isRequired,
  switchLabel: PropTypes.string.isRequired,
  switchTo: PropTypes.string.isRequired,
};
