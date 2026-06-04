'use client';

import { cn } from '@/lib/utils';

type TopLoadingBarProps = {
  active: boolean;
  progress?: number;
  className?: string;
};

/**
 * Thin top loading bar (replace with GIF later).
 */
export function TopLoadingBar({ active, progress, className }: TopLoadingBarProps) {
  const width =
    typeof progress === 'number' ? `${Math.min(100, Math.max(0, progress))}%` : undefined;

  return (
    <div
      role="progressbar"
      aria-hidden={!active}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={typeof progress === 'number' ? progress : undefined}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[200] h-1 overflow-hidden bg-transparent transition-opacity duration-200',
        active ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      <div
        className={cn(
          'h-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)] transition-[width] duration-300 ease-out',
          typeof progress !== 'number' && active && 'animate-loading-bar-indeterminate w-[40%]',
        )}
        style={width ? { width } : undefined}
      />
    </div>
  );
}
