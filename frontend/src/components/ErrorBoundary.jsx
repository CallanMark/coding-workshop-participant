/**
 * Catches an error thrown while a page renders, so one broken page shows a friendly message instead of
 * blanking the whole app. Inside the layout the nav bar keeps working; give it a `resetKey` (the URL path)
 * so moving to another page clears the error.
 */
import { Component } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    // A new page (a different resetKey) gets a fresh start.
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Alert
        severity="error"
        sx={{ m: 2 }}
        action={(
          <Stack direction="row" spacing={1}>
            <Button color="inherit" size="small" onClick={() => this.setState({ error: null })}>Try again</Button>
            <Button color="inherit" size="small" onClick={() => window.location.reload()}>Reload</Button>
          </Stack>
        )}
      >
        <AlertTitle>Something went wrong on this page</AlertTitle>
        Try again, reload, or use the menu to go somewhere else.
      </Alert>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
  resetKey: PropTypes.string,
};
