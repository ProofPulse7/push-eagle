'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const getStatusBadgeClassName = (enabled: boolean) =>
  enabled
    ? 'border border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300'
    : 'border border-border bg-muted text-muted-foreground';

const getActionButtonClassName = (enabled: boolean) =>
  enabled
    ? 'bg-red-500 text-white hover:bg-red-500/90'
    : 'bg-violet-600 text-white hover:bg-violet-600/90';

export { getStatusBadgeClassName, getActionButtonClassName };

type AutomationRuleToggleButtonProps = {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  disabledTitle?: string;
  size?: 'default' | 'sm';
};

export const AutomationRuleStatusBadge = ({ enabled }: { enabled: boolean }) => (
  <Badge className={getStatusBadgeClassName(enabled)}>{enabled ? 'Active' : 'Inactive'}</Badge>
);

export const AutomationRuleToggleButton = ({
  enabled,
  onToggle,
  disabled = false,
  disabledTitle,
  size = 'sm',
}: AutomationRuleToggleButtonProps) => (
  <Button
    size={size}
    className={getActionButtonClassName(enabled)}
    onClick={onToggle}
    disabled={disabled}
    title={disabledTitle}
  >
    {enabled ? 'Deactivate' : 'Activate'}
  </Button>
);
