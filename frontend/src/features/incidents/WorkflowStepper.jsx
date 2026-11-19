import PropTypes from 'prop-types';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Typography from '@mui/material/Typography';

const STEPS = [
  { status: 'open', label: 'Reported' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'resolved', label: 'Resolved' },
  { status: 'closed', label: 'Closed' },
];

/**
 * Where an incident is in the workflow. Blocked shows as an error on the "In progress" step.
 * @param {{status: string, blockedReason?: string|null}} props
 */
export default function WorkflowStepper({ status, blockedReason = null }) {
  const blocked = status === 'blocked';
  const current = STEPS.findIndex((step) => step.status === (blocked ? 'in_progress' : status));
  // A closed incident has finished every step.
  const activeStep = status === 'closed' ? STEPS.length : current;
  return (
    <Stepper activeStep={activeStep} alternativeLabel aria-label="Workflow">
      {STEPS.map((step, index) => {
        const isBlockedStep = blocked && index === current;
        return (
          <Step key={step.status}>
            <StepLabel
              error={isBlockedStep}
              optional={isBlockedStep && blockedReason ? (
                <Typography variant="caption" color="error">{blockedReason}</Typography>
              ) : null}
            >
              {isBlockedStep ? 'Blocked' : step.label}
            </StepLabel>
          </Step>
        );
      })}
    </Stepper>
  );
}

WorkflowStepper.propTypes = {
  status: PropTypes.string.isRequired,
  blockedReason: PropTypes.string,
};
