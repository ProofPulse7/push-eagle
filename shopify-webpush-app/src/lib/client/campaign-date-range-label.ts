import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

export const formatCampaignDateRangeLabel = (dateRange: DateRange | undefined) => {
  if (!dateRange?.from) {
    return 'All time';
  }

  const toDate = dateRange.to ?? dateRange.from;

  if (format(dateRange.from, 'LLL dd, y') === format(toDate, 'LLL dd, y')) {
    return format(dateRange.from, 'LLL dd, y');
  }

  return `${format(dateRange.from, 'LLL dd, y')} – ${format(toDate, 'LLL dd, y')}`;
};
