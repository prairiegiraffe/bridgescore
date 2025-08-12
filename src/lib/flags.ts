// Feature flags for BridgeScore
export const FLAGS = {
  ORGS: true, // Enable organization-scoped queries
  ASSISTANTS: true, // Enable AI assistant management
  TEAM_BOARDS: true, // Enable team management boards
  RESCORE_WITH_VERSION: true, // Enable rescoring calls with different assistant versions
  SETTINGS: true, // Enable organization settings page
} as const;

export type FeatureFlag = keyof typeof FLAGS;