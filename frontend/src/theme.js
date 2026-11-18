/**
 * The single MUI theme for the app.
 */
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: { main: '#1b4f8a' },
    background: { default: '#f5f7fa' },
  },
  shape: { borderRadius: 8 },
});

export default theme;
