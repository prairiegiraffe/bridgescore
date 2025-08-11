// Feature flags for BridgeScore
export const FLAGS = {
  ORGS: true, // Enable organization-scoped queries
  ASSISTANTS: true, // Enable AI assistant management
} as const;

export type FeatureFlag = keyof typeof FLAGS;