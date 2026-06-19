'use client';

import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CAMPAIGN_TIME_OPTIONS } from '@/lib/client/campaign-schedule';
import { cn } from '@/lib/utils';

type CampaignDateTimeFieldsProps = {
  label?: string;
  date?: Date;
  time: string;
  onDateChange: (value: Date | undefined) => void;
  onTimeChange: (value: string) => void;
  minDate?: Date;
  variant?: 'boxed' | 'inline';
  className?: string;
};

export function CampaignDateTimeFields({
  label,
  date,
  time,
  onDateChange,
  onTimeChange,
  minDate,
  variant = 'boxed',
  className,
}: CampaignDateTimeFieldsProps) {
  const pickers = (
    <div className={cn('flex flex-wrap items-center gap-2', variant === 'inline' ? 'flex-1' : 'grid gap-3 sm:grid-cols-2')}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'h-10 justify-start rounded-xl border-slate-200 bg-white text-left font-normal',
              variant === 'inline' ? 'min-w-[180px] flex-1' : 'h-11 w-full',
              !date && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">{date ? format(date, 'PPP') : 'Pick a date'}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={onDateChange}
            disabled={(value) => (minDate ? value < minDate : false)}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <Select value={time} onValueChange={onTimeChange}>
        <SelectTrigger
          className={cn(
            'h-10 rounded-xl border-slate-200 bg-white text-sm font-medium',
            variant === 'inline' ? 'w-[130px] shrink-0' : 'h-11',
          )}
        >
          <SelectValue placeholder="Select time" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {CAMPAIGN_TIME_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  if (variant === 'inline') {
    return <div className={cn('min-w-0', className)}>{pickers}</div>;
  }

  return (
    <div className={cn('space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4', className)}>
      {label ? <Label className="text-sm font-medium text-foreground">{label}</Label> : null}
      {pickers}
    </div>
  );
}
