
'use client';

import { useState, Fragment, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Calendar as CalendarIcon, X, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/context/settings-context';

const segmentCriteria = {
  actions: [
    { value: 'Clicked', label: 'Clicked' },
    { value: 'Purchased', label: 'Purchased' },
    { value: 'Purchased a product', label: 'Purchased a product' },
    { value: 'Purchased from collection', label: 'Purchased from collection' },
  ],
  properties: [
    { value: 'Subscribed', label: 'Subscribed' },
    { value: 'Location', label: 'Location' },
    { value: 'Customer tag', label: 'Customer tag' },
  ]
};

const countOptions = [
  { value: 'at least once', label: 'at least once' },
  { value: 'more than', label: 'more than' },
  { value: 'less than', label: 'less than' },
  { value: 'exactly', label: 'exactly' },
];

const actionDateOptions = [
  { value: 'at any time', label: 'at any time' },
  { value: 'before', label: 'before' },
  { value: 'after', label: 'after' },
  { value: 'less than', label: 'less than' },
  { value: 'more than', label: 'more than' },
  { value: 'between', label: 'between' },
];

const subscribeDateOptions = [
    { value: 'in the last', label: 'in the last' },
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
    { value: 'more than', label: 'more than' },
    { value: 'less than', label: 'less than' },
    { value: 'between', label: 'between' },
];

const countryOptions = [
  { value: 'USA', label: 'USA' },
  { value: 'Canada', label: 'Canada' },
  { value: 'UK', label: 'UK' },
  { value: 'Germany', label: 'Germany' },
  { value: 'India', label: 'India' },
  { value: 'Pakistan', label: 'Pakistan' },
];

const regionOptions = [
  { value: 'California', label: 'California' },
  { value: 'Ontario', label: 'Ontario' },
  { value: 'London', label: 'London' },
  { value: 'Bavaria', label: 'Bavaria' },
  { value: 'Maharashtra', label: 'Maharashtra' },
  { value: 'Sindh', label: 'Sindh' },
];

const cityOptions = [
    { value: 'Abbottabad', label: 'Abbottabad' },
    { value: 'Abdullah Khaskheli', label: 'Abdullah Khaskheli' },
    { value: 'Abu Dhabi', label: 'Abu Dhabi' },
    { value: 'Adilpur', label: 'Adilpur' },
    { value: 'Alboraya', label: 'Alboraya' },
    { value: 'New York', label: 'New York' },
    { value: 'Toronto', label: 'Toronto' },
    { value: 'London', label: 'London' },
    { value: 'Munich', label: 'Munich' },
    { value: 'Mumbai', label: 'Mumbai' },
    { value: 'Karachi', label: 'Karachi' },
];

type LocationValue = { type: 'country' | 'region' | 'city'; value: string; label: string };

type Condition = {
  id: string;
  type: string;
  // 'is' or 'is not' / 'has' or 'has not'
  operator: string; 
  countOperator: string;
  countValue: number;
  dateOperator: string;
  dateValue?: DateRange;
  textValue: string;
  daysValue: number;
  selectedValues: LocationValue[];
};

type ConditionGroup = {
  id: string;
  conditions: Condition[];
};

const createNewCondition = (): Condition => ({
  id: crypto.randomUUID(),
  type: 'Clicked',
  operator: 'has',
  countOperator: 'at least once',
  countValue: 1,
  dateOperator: 'at any time',
  textValue: '',
  daysValue: 30,
  selectedValues: [],
});

const OrSeparator = () => (
    <div className="flex items-center my-4">
        <span className="flex-shrink text-sm font-semibold text-muted-foreground">Or</span>
        <div className="flex-grow border-t ml-4"></div>
    </div>
);


const AndSeparator = () => (
    <div className="relative my-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
            <span className="bg-card px-3 text-base font-semibold text-foreground">And</span>
        </div>
    </div>
);

const MultiSelectPillFilter = ({
  placeholder,
  options,
  selectedValues,
  onSelect,
  onUnselect,
}: {
  placeholder: string;
  options: { value: string; label: string }[];
  selectedValues: string[];
  onSelect: (value: string, label: string) => void;
  onUnselect: (value: string) => void;
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (option: { value: string; label: string }) => {
    if (!selectedValues.includes(option.value)) {
      onSelect(option.value, option.label);
    } else {
      onUnselect(option.value);
    }
  };

  const handleSelectAll = () => {
    options.forEach(o => {
        if (!selectedValues.includes(o.value)) {
            onSelect(o.value, o.label);
        }
    });
  }

  const handleUnselectAll = () => {
    selectedValues.forEach(onUnselect);
  }

  return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 bg-card">
            {placeholder} <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0" align="center">
          <div className="p-2 border-b">
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-9"
            />
          </div>
          <ScrollArea className="h-48" type="always">
            <div className="p-1">
              {filteredOptions.map(option => (
                <Label
                  key={option.value}
                  htmlFor={`checkbox-${option.value}`}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    id={`checkbox-${option.value}`}
                    checked={selectedValues.includes(option.value)}
                    onCheckedChange={() => handleSelect(option)}
                    className="h-4 w-4 rounded-full"
                  />
                  <span className="font-normal w-full">
                    {option.label}
                  </span>
                </Label>
              ))}
              {filteredOptions.length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">No results found.</p>
              )}
            </div>
          </ScrollArea>
           <div className="p-2 flex justify-between items-center border-t">
                <Button variant="link" onClick={handleUnselectAll} className="text-muted-foreground h-auto p-0 text-sm">Unselect All</Button>
                <Button variant="link" onClick={handleSelectAll} className="h-auto p-0 text-sm">Select All</Button>
           </div>
        </PopoverContent>
      </Popover>
  );
};


export default function NewSegmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { shopDomain } = useSettings();
  const [resolvedShopDomain, setResolvedShopDomain] = useState('');
  const [segmentName, setSegmentName] = useState('');
  const [estimatedCount, setEstimatedCount] = useState(0);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [conditionGroups, setConditionGroups] = useState<ConditionGroup[]>([
    { id: crypto.randomUUID(), conditions: [createNewCondition()] },
  ]);

  useEffect(() => {
    const fromContext = (shopDomain || '').trim().toLowerCase();
    const fromQuery = new URLSearchParams(window.location.search).get('shop')?.trim().toLowerCase() || '';
    const fromStorage = (localStorage.getItem('shopDomain') || '').trim().toLowerCase();
    const candidate = [fromContext, fromQuery, fromStorage].find((value) => value.endsWith('.myshopify.com')) || '';
    setResolvedShopDomain(candidate);
  }, [shopDomain]);

  useEffect(() => {
    if (!resolvedShopDomain) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsEstimating(true);
        const response = await fetch(`/api/segments/estimate?shop=${encodeURIComponent(resolvedShopDomain)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopDomain: resolvedShopDomain,
            conditionGroups: conditionGroups.map((group) => ({
              id: group.id,
              conditions: group.conditions.map((condition) => ({
                ...condition,
                dateValue: {
                  from: condition.dateValue?.from ? new Date(condition.dateValue.from).toISOString() : undefined,
                  to: condition.dateValue?.to ? new Date(condition.dateValue.to).toISOString() : undefined,
                },
              })),
            })),
          }),
        });

        const json = await response.json();
        if (!response.ok || !json?.ok) {
          throw new Error(json?.error ?? 'Failed to estimate audience.');
        }

        setEstimatedCount(Number(json.estimatedCount ?? 0));
      } catch {
        setEstimatedCount(0);
      } finally {
        setIsEstimating(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [conditionGroups, resolvedShopDomain]);

  const addOrCondition = (groupId: string) => {
    setConditionGroups(
      conditionGroups.map(group =>
        group.id === groupId
          ? { ...group, conditions: [...group.conditions, createNewCondition()] }
          : group
      )
    );
  };

  const addAndGroup = () => {
    setConditionGroups([...conditionGroups, { id: crypto.randomUUID(), conditions: [createNewCondition()] }]);
  };

  const removeCondition = (groupId: string, conditionId: string) => {
    setConditionGroups(prev => {
      const newGroups = prev.map(group => {
        if (group.id === groupId) {
          const newConditions = group.conditions.filter(c => c.id !== conditionId);
          if (newConditions.length === 0) return null;
          return { ...group, conditions: newConditions };
        }
        return group;
      }).filter((g): g is ConditionGroup => g !== null);

      if (newGroups.length === 0) {
        return [{ id: crypto.randomUUID(), conditions: [createNewCondition()] }];
      }
      return newGroups;
    });
  };

  const handleConditionChange = (
    groupId: string,
    conditionId: string,
    field: keyof Condition,
    value: any
  ) => {
    setConditionGroups(
      conditionGroups.map(group =>
        group.id === groupId
          ? {
              ...group,
              conditions: group.conditions.map(c =>
                c.id === conditionId ? { ...c, [field]: value } : c
              ),
            }
          : group
      )
    );
  };

  const handleCreateSegment = async () => {
    if (!resolvedShopDomain || !segmentName.trim() || estimatedCount <= 0 || isCreating) {
      return;
    }

    try {
      setIsCreating(true);
      const response = await fetch(`/api/segments?shop=${encodeURIComponent(resolvedShopDomain)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopDomain: resolvedShopDomain,
          name: segmentName.trim(),
          conditionGroups: conditionGroups.map((group) => ({
            id: group.id,
            conditions: group.conditions.map((condition) => ({
              ...condition,
              dateValue: {
                from: condition.dateValue?.from ? new Date(condition.dateValue.from).toISOString() : undefined,
                to: condition.dateValue?.to ? new Date(condition.dateValue.to).toISOString() : undefined,
              },
            })),
          })),
        }),
      });

      const json = await response.json();
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error ?? 'Failed to create segment.');
      }

      toast({
        title: 'Segment created',
        description: 'Your segment is now available for campaign targeting.',
      });
      router.push('/segments');
    } catch (error) {
      toast({
        title: 'Unable to create segment',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const renderConditionContent = (condition: Condition, groupId: string) => {
    const change = (field: keyof Condition, value: any) => handleConditionChange(groupId, condition.id, field, value);

    const isActionType = segmentCriteria.actions.some(a => a.value === condition.type);

    const countInputs = (
        <>
            <Select value={condition.countOperator} onValueChange={(v) => change('countOperator', v)}>
                <SelectTrigger className="w-auto bg-card"><SelectValue/></SelectTrigger>
                <SelectContent>
                    {countOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
            </Select>
            {condition.countOperator !== 'at least once' && (
                <>
                    <Input className="w-20 bg-card" type="number" placeholder="1" value={condition.countValue} onChange={e => change('countValue', parseInt(e.target.value) || 1)} />
                    <span>times</span>
                </>
            )}
        </>
    );

    const dateInputs = (
        <>
            <Select value={condition.dateOperator} onValueChange={(v) => change('dateOperator', v)}>
                <SelectTrigger className="w-auto bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {(isActionType ? actionDateOptions : subscribeDateOptions).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
            </Select>
            {['before', 'after'].includes(condition.dateOperator) && (
                 <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("font-normal w-auto justify-start bg-card", !condition.dateValue?.from && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {condition.dateValue?.from ? format(condition.dateValue.from, "PPP") : "Pick a date"}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={condition.dateValue?.from} onSelect={(d) => change('dateValue', {from: d, to: undefined})} disabled={(date) => date > new Date()} initialFocus/></PopoverContent>
                </Popover>
            )}
             {condition.dateOperator === 'between' && (
                <Popover>
                    <PopoverTrigger asChild>
                         <Button variant="outline" className={cn("font-normal w-auto justify-start bg-card", !condition.dateValue && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {condition.dateValue?.from && condition.dateValue?.to ? `${format(condition.dateValue.from, "LLL dd, y")} - ${format(condition.dateValue.to, "LLL dd, y")}` : "Pick a date range"}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="range" selected={condition.dateValue} onSelect={(range) => change('dateValue', range)} disabled={(date) => date > new Date()} initialFocus/></PopoverContent>
                </Popover>
            )}
             {['more than', 'less than', 'in the last'].includes(condition.dateOperator) && (
                <>
                    <Input className="w-20 bg-card" type="number" placeholder="30" value={condition.daysValue} onChange={e => change('daysValue', parseInt(e.target.value) || 30)} />
                    <span>days ago</span>
                </>
            )}
        </>
    );

    switch (condition.type) {
        case 'Clicked': return <div className="flex items-center gap-2 flex-wrap"><span>Subscriber has clicked a notification</span>{countInputs}{dateInputs}</div>
        case 'Purchased': return <div className="flex items-center gap-2 flex-wrap"><span>Subscriber has purchased</span>{countInputs}{dateInputs}</div>
        case 'Purchased a product':
        case 'Purchased from collection':
            return (
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span>Subscriber</span>
                        <Select value={condition.operator} onValueChange={(v) => change('operator', v)}>
                            <SelectTrigger className="w-auto bg-card"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="has">has</SelectItem><SelectItem value="has not">has not</SelectItem></SelectContent>
                        </Select>
                        <span>purchased</span>
                        <Input className="w-48 bg-card" placeholder={condition.type === 'Purchased a product' ? "Product title" : "Collection name"} value={condition.textValue} onChange={e => change('textValue', e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pl-4 border-l-2 ml-2">
                        {countInputs}{dateInputs}
                    </div>
                </div>
            );
        case 'Subscribed': return <div className="flex items-center gap-2 flex-wrap"><span>Subscriber has subscribed</span>{dateInputs}</div>;
        case 'Location':
            const handleLocationSelect = (type: 'country' | 'region' | 'city') => (value: string, label: string) => {
              if (!condition.selectedValues.some(v => v.value === value)) {
                change('selectedValues', [...condition.selectedValues, { type, value, label }]);
              }
            };
            const handleLocationUnselect = (value: string) => {
              change('selectedValues', condition.selectedValues.filter(v => v.value !== value));
            };

            return <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <span>Subscriber</span>
                    <Select value={condition.operator} onValueChange={(v) => change('operator', v)}>
                        <SelectTrigger className="w-auto bg-card"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="is">is</SelectItem><SelectItem value="is not">is not</SelectItem></SelectContent>
                    </Select>
                    <span>from</span>
                    <MultiSelectPillFilter
                        placeholder="Select country"
                        options={countryOptions}
                        selectedValues={condition.selectedValues.filter(v => v.type === 'country').map(v => v.value)}
                        onSelect={(value, label) => handleLocationSelect('country')(value, label)}
                        onUnselect={handleLocationUnselect}
                    />
                    <MultiSelectPillFilter
                        placeholder="Select region"
                        options={regionOptions}
                        selectedValues={condition.selectedValues.filter(v => v.type === 'region').map(v => v.value)}
                        onSelect={(value, label) => handleLocationSelect('region')(value, label)}
                        onUnselect={handleLocationUnselect}
                    />
                    <MultiSelectPillFilter
                        placeholder="Select city"
                        options={cityOptions}
                        selectedValues={condition.selectedValues.filter(v => v.type === 'city').map(v => v.value)}
                        onSelect={(value, label) => handleLocationSelect('city')(value, label)}
                        onUnselect={handleLocationUnselect}
                    />
                </div>
                 {condition.selectedValues.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                        {condition.selectedValues.map(v => (
                            <Badge key={v.value} variant="outline" className="gap-1.5 pr-1 bg-background">
                            {v.label}
                            <button onClick={() => handleLocationUnselect(v.value)} className="rounded-full hover:bg-black/10 dark:hover:bg-white/10">
                                <X className="h-3 w-3" />
                            </button>
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        case 'Customer tag':
             return <div className="flex items-center gap-2 flex-wrap">
                <span>Customer tag</span>
                <Select value={condition.operator} onValueChange={(v) => change('operator', v)}>
                    <SelectTrigger className="w-auto bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="is">is</SelectItem><SelectItem value="is not">is not</SelectItem></SelectContent>
                </Select>
                <Input className="w-48 bg-card" placeholder="Select customer tag" value={condition.textValue} onChange={e => change('textValue', e.target.value)} />
            </div>;
        default: return null;
    }
  };

  const handleConditionTypeChange = (groupId: string, conditionId: string, newType: string) => {
    const isProperty = segmentCriteria.properties.some(p => p.value === newType);
    const newOperator = isProperty ? 'is' : 'has';
    const newDateOperator = newType === 'Subscribed' ? 'in the last' : 'at any time';
    
    setConditionGroups(groups => groups.map(group => {
        if (group.id === groupId) {
            return {
                ...group,
                conditions: group.conditions.map(c => {
                    if (c.id === conditionId) {
                        return { ...c, type: newType, operator: newOperator, dateOperator: newDateOperator, selectedValues: [] };
                    }
                    return c;
                })
            };
        }
        return group;
    }));
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 bg-muted/40 min-h-screen">
      <div>
        <div className="flex items-center gap-4 mb-8">
            <Button variant="outline" size="icon" asChild>
            <Link href="/segments">
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Back to Segments</span>
            </Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Create new segment</h1>
        </div>

        <div className="space-y-8">
            <div className="bg-card p-6 rounded-lg border">
                <div className="space-y-2">
                    <Label htmlFor="segment-name">Segment name <span className="text-destructive">*</span></Label>
                    <Input
                    id="segment-name"
                    placeholder="Enter name"
                    value={segmentName}
                    onChange={(e) => setSegmentName(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground pt-2">Estimated subscriber count: {estimatedCount.toLocaleString()}</p>
                </div>
            </div>

            <div className="bg-card p-6 rounded-lg border space-y-4">
                <div className="space-y-1">
                    <h2 className="text-xl font-semibold">Build your segment</h2>
                    <p className="text-muted-foreground">Build your segment, enter your definition</p>
                </div>
                {conditionGroups.map((group, groupIndex) => (
                    <Fragment key={group.id}>
                    <div className="bg-muted/40 p-6 rounded-lg border-2 border-dashed space-y-6">
                        {group.conditions.map((condition, conditionIndex) => (
                        <Fragment key={condition.id}>
                            {conditionIndex > 0 && <OrSeparator />}
                            <div>
                               <div className="flex items-center justify-between mb-2">
                                    <Select value={condition.type} onValueChange={(v) => handleConditionTypeChange(group.id, condition.id, v)}>
                                        <SelectTrigger className="w-auto h-8 text-xs px-2 bg-card">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Actions</div>
                                            {segmentCriteria.actions.map(action => <SelectItem key={action.value} value={action.value}>{action.label}</SelectItem>)}
                                            <Separator className="my-1" />
                                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Properties</div>
                                            {segmentCriteria.properties.map(prop => <SelectItem key={prop.value} value={prop.value}>{prop.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => removeCondition(group.id, condition.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                               </div>
                               <div className="p-4 bg-background rounded-md border">
                                    {renderConditionContent(condition, group.id)}
                               </div>
                            </div>
                        </Fragment>
                        ))}
                        <div className="pt-4 border-t border-border">
                            <Button variant="outline" className="bg-card" size="sm" onClick={() => addOrCondition(group.id)}>
                            <Plus className="mr-2 h-4 w-4" /> OR condition
                            </Button>
                        </div>
                    </div>
                    {groupIndex < conditionGroups.length - 1 && <AndSeparator />}
                    </Fragment>
                ))}
                
                <Button variant="outline" className="bg-card" onClick={addAndGroup}>
                  <Plus className="mr-2 h-4 w-4" /> AND condition
                </Button>
            </div>
            
            <div className="bg-card p-6 rounded-lg border">
                <div className="space-y-2">
                    <Label>Estimated subscriber count</Label>
                    <div className="flex items-center gap-2">
                      {isEstimating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      <Input
                        value={estimatedCount.toLocaleString()}
                        disabled
                      />
                    </div>
                </div>
            </div>


            <div className="pt-8 flex justify-end">
                <Button size="lg" disabled={!segmentName || estimatedCount <= 0 || isCreating || !resolvedShopDomain} onClick={handleCreateSegment}>
                  {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Segment
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
}
