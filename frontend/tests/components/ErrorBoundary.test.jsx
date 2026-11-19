import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropTypes from 'prop-types';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import ErrorBoundary from '../../src/components/ErrorBoundary';

const state = { broken: true };

/** A page that crashes while `state.broken` is true. */
function Page({ name }) {
  if (state.broken) throw new Error('boom');
  return <p>{name} page</p>;
}

Page.propTypes = { name: PropTypes.string.isRequired };

describe('ErrorBoundary', () => {
  beforeEach(() => {
    state.broken = true;
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React and the boundary both log the crash
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows a friendly message instead of a blank screen', () => {
    render(<ErrorBoundary resetKey="/a"><Page name="A" /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong on this page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('tries the page again on request', async () => {
    render(<ErrorBoundary resetKey="/a"><Page name="A" /></ErrorBoundary>);
    state.broken = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('A page')).toBeInTheDocument();
  });

  it('clears the error when you move to another page', () => {
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Page name="A" /></ErrorBoundary>);
    state.broken = false;
    rerender(<ErrorBoundary resetKey="/b"><Page name="B" /></ErrorBoundary>);
    expect(screen.getByText('B page')).toBeInTheDocument();
  });

  it('renders the page untouched when nothing goes wrong', () => {
    state.broken = false;
    render(<ErrorBoundary><Page name="A" /></ErrorBoundary>);
    expect(screen.getByText('A page')).toBeInTheDocument();
  });
});
