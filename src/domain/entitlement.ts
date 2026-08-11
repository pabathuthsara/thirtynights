import type { AccessTier, Chapter } from '@/types';

type ServerPlanState = AccessTier;
type ServerPurchaseStatus = Chapter['purchaseStatus'];

/**
 * The schedule's historical target is intentionally not an input. Only a
 * currently granted ledger projection may produce paid access.
 */
export function accessTierFromServer(
  planState: ServerPlanState,
  purchaseStatus: ServerPurchaseStatus,
): AccessTier {
  if (purchaseStatus !== 'granted') return 'trial';
  if (planState === 'paid90') return 'paid90';
  if (planState === 'paid30') return 'paid30';
  return 'trial';
}

export function targetForAccessTier(tier: AccessTier): Chapter['targetLength'] {
  return tier === 'paid90' ? 90 : tier === 'paid30' ? 30 : 7;
}
