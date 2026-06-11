import { endOfDay, startOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';

const DEFAULT_RANGE_DAYS = 30;

export const resolveAnalyticsDateRange = (dateRange?: DateRange) => {
  const to = startOfDay(dateRange?.to ?? new Date());
  const from = startOfDay(
    dateRange?.from ?? new Date(Date.now() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000),
  );

  return {
    from,
    to: endOfDay(to),
    fromIso: from.toISOString(),
    toIso: endOfDay(to).toISOString(),
  };
};
