// Feature flags for BridgeScore
export const FLAGS = {
  ORGS: false, // Enable organization-scoped queries
} as const;

export type FeatureFlag = keyof typeof FLAGS;