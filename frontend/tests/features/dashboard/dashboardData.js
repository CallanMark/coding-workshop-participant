/**
 * Fake dashboard responses shaped like the analytics API.
 */
export const SUMMARY = {
  days: 30,
  open: {
    total: 4,
    escalated: 1,
    by_status: { open: 2, in_progress: 1, blocked: 1 },
    by_priority: {
      low: 0, medium: 3, high: 1, critical: 0,
    },
  },
  oldest_open: [{
    id: 3,
    title: 'Wi-Fi drops',
    status: 'blocked',
    priority: 'high',
    is_escalated: true,
    created_at: '2026-11-15 14:56:51+00:00',
    assignee_name: 'Tina Tech',
  }],
  categories: [{
    id: 5, name: 'Network', type: 'technology', incidents: 2,
  }],
  speed: {
    reported: 4,
    resolved: 2,
    median_seconds: { acknowledge: 3600, assign: 5400, resolve: null },
  },
};

export const TEAM = { ...SUMMARY, team: { id: 2, name: 'Workplace Technology' } };

export const TINA_DASHBOARD = {
  ...SUMMARY,
  engineer: {
    id: 5, name: 'Tina Tech', team_id: 2, team_name: 'Workplace Technology', is_available: true,
  },
};

export const FEEDBACK = {
  average: 3.5,
  ratings: 2,
  recent: [{
    incident_id: 7,
    incident_title: 'Projector dead',
    rating: 3,
    comment: 'Slow to hear back',
    reporter_name: 'Eve Employee',
    updated_at: '2026-11-18 09:00:00+00:00',
  }],
};

export const HOTSPOTS = {
  days: 30,
  buildings: [{
    id: 1, name: 'HQ Tower', incidents: 5, recurring: 2,
  }],
  floors: [{
    id: 1, name: 'Ground', building_name: 'HQ Tower', incidents: 3, recurring: 1,
  }],
  seats: [],
};
