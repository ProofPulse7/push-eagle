
'use client'

import * as React from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import { addDays, format } from 'date-fns'
import type { DateRange } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '../ui/separator'

const presets = [
    { label: "Last 24 hours", days: 1 },
    { label: "Last 7 days", days: 7 },
    { label: "Last 30 days", days: 30 },
    { label: "Last 90 days", days: 90 },
    { label: "All time", days: null },
]

interface DateRangePickerProps extends React.HTMLAttributes<HTMLDivElement> {
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
  size?: 'default' | 'sm';
}

export function DateRangePicker({
  className,
  date,
  setDate,
  size = 'default',
}: DateRangePickerProps) {
  const [tempDate, setTempDate] = React.useState<DateRange | undefined>(date);
  const [activePreset, setActivePreset] = React.useState<string | null>(null)
  const [isOpen, setIsOpen] = React.useState(false)
  
  React.useEffect(() => {
    setTempDate(date);
    const today = new Date();
    today.setHours(0,0,0,0);

    let foundPreset = null;
    if (!date) {
        foundPreset = "All time";
    } else if (date.from && date.to) {
        for (const preset of presets) {
            if (preset.days) {
                const fromDate = addDays(today, -preset.days + 1);
                if (fromDate.getTime() === date.from.getTime() && today.getTime() === date.to.getTime()) {
                    foundPreset = preset.label;
                    break;
                }
            }
        }
    }
    setActivePreset(foundPreset);
  }, [date]);

  const handlePresetClick = (preset: typeof presets[number]) => {
      setActivePreset(preset.label)
      if (preset.days) {
          const today = new Date();
           today.setHours(0,0,0,0);
          const fromDate = addDays(today, -preset.days + 1);
          setTempDate({ from: fromDate, to: today });
      } else {
          setTempDate(undefined);
      }
  }
  
  const handleApply = () => {
    setDate(tempDate);
    setIsOpen(false);
  }

  const handleCancel = () => {
    setTempDate(date);
    setIsOpen(false);
  }
  
  const getButtonText = () => {
      if (activePreset && activePreset !== "All time") {
          return activePreset;
      }
      if (!date) {
          return "All time";
      }
      if (date.from) {
          if (date.to) {
              if (format(date.from, 'LLL dd, y') === format(date.to, 'LLL dd, y')) {
                   return format(date.from, 'LLL dd, y');
              }
              return `${format(date.from, 'LLL dd, y')} - ${format(date.to, 'LLL dd, y')}`
          }
          return format(date.from, 'LLL dd, y');
      }
      return 'Pick a date';
  }

  const buttonClass = size === 'sm' ? 'h-9 min-w-[200px]' : 'h-10 min-w-[240px]';

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={'outline'}
            className={cn(
              'w-auto justify-start text-left font-normal',
               buttonClass,
              !date && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span>{getButtonText()}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-auto flex-col p-0" align="end">
            <div className="flex">
                <div className="flex flex-col space-y-1 border-r p-2">
                    {presets.map(preset => (
                        <Button 
                            key={preset.label} 
                            variant={activePreset === preset.label ? 'secondary' : 'ghost'} 
                            onClick={() => handlePresetClick(preset)}
                            className="justify-start text-sm w-full"
                        >
                            {preset.label}
                        </Button>
                    ))}
                </div>
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={tempDate?.from}
                selected={tempDate}
                onSelect={(selected) => {
                    setTempDate(selected);
                    setActivePreset(null);
                }}
                numberOfMonths={1}
                size={size}
              />
            </div>
            <Separator />
            <div className="flex justify-end gap-2 p-2">
                <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
                <Button onClick={handleApply}>Apply</Button>
            </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
