import { differenceInDays, eachMonthOfInterval, endOfDay, format, startOfDay } from 'date-fns';

export type SubscriberGrowthPoint = {
  date: string;
  subscribers: number;
};

export type SubscriberGrowthPayload = {
  ok?: boolean;
  from?: string;
  to?: string;
  points?: SubscriberGrowthPoint[];
  totalNewSubscribers?: number;
};

export const sliceSubscriberGrowthSeries = (
  payload: SubscriberGrowthPayload | undefined,
  from: Date,
  to: Date,
): SubscriberGrowthPayload | undefined => {
  if (!payload?.ok || !Array.isArray(payload.points)) {
    return payload;
  }

  const fromKey = format(startOfDay(from), 'yyyy-MM-dd');
  const toKey = format(endOfDay(to), 'yyyy-MM-dd');

  const points = payload.points
    .map((point) => ({
      date: String(point.date ?? ''),
      subscribers: Number(point.subscribers ?? 0),
    }))
    .filter((point) => point.date && point.date >= fromKey && point.date <= toKey);

  const totalNewSubscribers = points.reduce((sum, point) => sum + point.subscribers, 0);

  return {
    ...payload,
    from: startOfDay(from).toISOString(),
    to: endOfDay(to).toISOString(),
    points,
    totalNewSubscribers,
  };
};

export const buildSubscriberGrowthChartData = (
  payload: SubscriberGrowthPayload | undefined,
  from: Date,
  to: Date,
): { data: Array<{ date: string; subscribers: number }>; total: number } => {
  if (!payload?.ok) {
    return { data: [], total: 0 };
  }

  const rawPoints = Array.isArray(payload.points) ? payload.points : [];
  const chartFrom = typeof payload.from === 'string' ? new Date(payload.from) : from;
  const chartTo = typeof payload.to === 'string' ? new Date(payload.to) : to;

  const pointDates = rawPoints
    .map((item) => (item?.date ? new Date(`${item.date}T00:00:00.000Z`) : null))
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));

  const rangeDays =
    pointDates.length > 1
      ? differenceInDays(pointDates[pointDates.length - 1], pointDates[0])
      : differenceInDays(chartTo, chartFrom);

  if (rangeDays > 90) {
    const monthly = new Map<string, number>();
    for (const item of rawPoints) {
      const day = item?.date ? new Date(`${item.date}T00:00:00.000Z`) : null;
      if (!day || Number.isNaN(day.getTime())) {
        continue;
      }
      const label = format(day, 'MMM yy');
      monthly.set(label, (monthly.get(label) ?? 0) + Number(item?.subscribers ?? 0));
    }

    const interval = eachMonthOfInterval({ start: chartFrom, end: chartTo });
    const monthPoints = interval.map((month) => {
      const label = format(month, 'MMM yy');
      return {
        date: label,
        subscribers: monthly.get(label) ?? 0,
      };
    });

    return {
      data: monthPoints,
      total: monthPoints.reduce((sum, item) => sum + item.subscribers, 0),
    };
  }

  const normalized = rawPoints.map((item) => {
    const parsedDate = item?.date ? new Date(`${item.date}T00:00:00.000Z`) : null;
    return {
      date:
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? format(parsedDate, 'MMM d')
          : 'Unknown',
      subscribers: Number(item?.subscribers ?? 0),
    };
  });

  return {
    data: normalized,
    total: Number(
      payload.totalNewSubscribers ??
        normalized.reduce((sum, item) => sum + item.subscribers, 0),
    ),
  };
};
