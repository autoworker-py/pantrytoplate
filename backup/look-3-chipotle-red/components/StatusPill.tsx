import { STATUS_LABEL } from '../lib/format';
import type { ExpiryStatus, IngredientStatus } from '../lib/types';

export function IngredientPill({ status }: { status: IngredientStatus }) {
  const tone = status === 'ok' ? '' : status === 'unknown_conversion' ? 'neutral' : status === 'short' ? 'warn' : 'danger';
  return <span className={`pill ${tone}`}>{STATUS_LABEL[status]}</span>;
}

export function ExpiryPill({ status, label }: { status: ExpiryStatus; label: string }) {
  const tone = status === 'expired' ? 'danger' : status === 'expiring_soon' ? 'warn' : status === 'unknown' ? 'neutral' : '';
  return <span className={`pill ${tone}`}>{label}</span>;
}
