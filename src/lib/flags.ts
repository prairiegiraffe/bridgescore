// Feature flags for BridgeScore
export const FLAGS = {
  ORGS: true, // Enable organization-scoped queries
  ASSISTANTS: true, // Enable AI assistant management
  TEAM_BOARDS: true, // Enable team management boards
} as const;

export type FeatureFlag = keyof typeof FLAGS;