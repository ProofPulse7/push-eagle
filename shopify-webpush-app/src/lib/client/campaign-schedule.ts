export const CAMPAIGN_TIME_OPTIONS = [
  '12:00 AM',
  '12:30 AM',
  '1:00 AM',
  '1:30 AM',
  '2:00 AM',
  '2:30 AM',
  '3:00 AM',
  '3:30 AM',
  '4:00 AM',
  '4:30 AM',
  '5:00 AM',
  '5:30 AM',
  '6:00 AM',
  '6:30 AM',
  '7:00 AM',
  '7:30 AM',
  '8:00 AM',
  '8:30 AM',
  '9:00 AM',
  '9:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
  '12:30 PM',
  '1:00 PM',
  '1:30 PM',
  '2:00 PM',
  '2:30 PM',
  '3:00 PM',
  '3:30 PM',
  '4:00 PM',
  '4:30 PM',
  '5:00 PM',
  '5:30 PM',
  '6:00 PM',
  '6:30 PM',
  '7:00 PM',
  '7:30 PM',
  '8:00 PM',
  '8:30 PM',
  '9:00 PM',
  '9:30 PM',
  '10:00 PM',
  '10:30 PM',
  '11:00 PM',
  '11:30 PM',
] as const;

export const buildCampaignDateTime = (date?: Date, time?: string): Date | null => {
  if (!date || !time?.trim()) {
    return null;
  }

  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!match) {
    return null;
  }

  const [, hourValue, minuteValue, meridiem] = match;
  let hours = Number(hourValue) % 12;
  if (meridiem.toUpperCase() === 'PM') {
    hours += 12;
  }

  const result = new Date(date);
  result.setHours(hours, Number(minuteValue), 0, 0);
  return result;
};

export const formatCampaignScheduleLabel = (value?: Date | null) => {
  if (!value) {
    return 'Immediately';
  }

  return value.toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};
