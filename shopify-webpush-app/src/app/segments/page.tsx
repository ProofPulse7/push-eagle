
'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PlusCircle, FileUp, BookOpen, Trash2, ChevronLeft, ChevronRight, X, Plus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const initialSegments = [
  { name: 'High-Value Customers', type: 'Dynamic', subscribers: '15,200', criteria: 'Total spend > $500' },
  { name: 'New Subscribers (Last 30 Days)', type: 'Dynamic', subscribers: '8,430', criteria: 'Subscribed in last 30 days' },
  { name: 'Inactive Users', type: 'Dynamic', subscribers: '25,600', criteria: 'Last seen > 90 days ago' },
  { name: 'iOS Users', type: 'Static', subscribers: '350,120', criteria: 'Platform is iOS' },
];

const initialCustomAttributes = [
  { name: 'LASTNAME', type: 'text' },
  { name: 'FIRSTNAME', type: 'text' },
  { name: 'CONTACT_TIMEZONE', type: 'text' },
  { name: 'NOTE', type: 'text' },
  { name: 'COMPANY', type: 'text' },
  { name: 'PURCHASE_COUNT', type: 'number' },
  { name: 'LAST_PURCHASE_DATE', type: 'date' },
  { name: 'COUNTRY', type: 'text' },
  { name: 'PROVINCE', type: 'text' },
  { name: 'COUNTRY_CODE', type: 'text' },
  { name: 'PROVINCE_CODE', type: 'text' },
  { name: 'CITY', type: 'text' },
  { name: 'ZIP', type: 'text' },
];

const ITEMS_PER_PAGE = 5;

const AddAttributeDialog = ({ 
    open, 
    onOpenChange,
    onAddAttribute,
    existingAttributes,
}: { 
    open: boolean, 
    onOpenChange: (open: boolean) => void,
    onAddAttribute: (name: string, type: string) => void,
    existingAttributes: { name: string, type: string }[],
}) => {
    const [attributeName, setAttributeName] = useState('');
    const [attributeType, setAttributeType] = useState('text');
    const [categories, setCategories] = useState(['']);
    const [options, setOptions] = useState(['']);
    const [errors, setErrors] = useState<{ name?: string, categories?: string, options?: string }>({});
    const MAX_LENGTH = 50;

    const resetState = () => {
        setAttributeName('');
        setAttributeType('text');
        setCategories(['']);
        setOptions(['']);
        setErrors({});
    }

    const validate = (name: string, currentCategories: string[], currentOptions: string[], type: string) => {
        const newErrors: { name?: string, categories?: string, options?: string } = {};
        
        const normalizedName = name.trim().toUpperCase().replace(/\s/g, '_');
        if (normalizedName && existingAttributes.some(attr => attr.name === normalizedName)) {
            newErrors.name = 'Attribute name must be unique';
        }

        if (type === 'category') {
            const categorySet = new Set<string>();
            for (const category of currentCategories) {
                const trimmed = category.trim();
                if (trimmed && categorySet.has(trimmed)) {
                    newErrors.categories = 'Category attribute value & label must be unique';
                    break;
                }
                if(trimmed) categorySet.add(trimmed);
            }
        }

        if (type === 'multiple-choice') {
            const optionSet = new Set<string>();
            for (const option of currentOptions) {
                 const trimmed = option.trim();
                if (trimmed && optionSet.has(trimmed)) {
                    newErrors.options = 'Option attribute value & label must be unique';
                    break;
                }
                if(trimmed) optionSet.add(trimmed);
            }
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }

    const handleSubmit = () => {
        if (validate(attributeName, categories, options, attributeType) && attributeName.trim()) {
            onAddAttribute(attributeName.trim().toUpperCase().replace(/\s/g, '_'), attributeType);
            resetState();
            onOpenChange(false);
        }
    }

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            resetState();
        }
        onOpenChange(open);
    }
    
    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setAttributeName(e.target.value);
        validate(e.target.value, categories, options, attributeType);
    }

    const handleCategoryChange = (index: number, value: string) => {
        const newCategories = [...categories];
        newCategories[index] = value;
        setCategories(newCategories);
        validate(attributeName, newCategories, options, attributeType);
    }

    const addCategory = () => {
        setCategories([...categories, '']);
    }
    
     const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
        validate(attributeName, categories, newOptions, attributeType);
    };

    const addOption = () => {
        setOptions([...options, '']);
    }
    
    const handleAttributeTypeChange = (type: string) => {
        setAttributeType(type);
        validate(attributeName, categories, options, type);
    }

    const isSubmitDisabled = Object.keys(errors).length > 0 || !attributeName.trim();

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add custom attribute</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="attribute-name">
                            Attribute name
                        </Label>
                        <div className="relative">
                            <Input
                                id="attribute-name"
                                value={attributeName}
                                onChange={handleNameChange}
                                maxLength={MAX_LENGTH}
                                className={cn("pr-14", errors.name && "border-destructive")}
                            />
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-muted-foreground">
                                {attributeName.length}/{MAX_LENGTH}
                            </div>
                        </div>
                         {errors.name && <p className="text-sm text-destructive flex items-center gap-1.5"><Info className="h-4 w-4" />{errors.name}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="attribute-type">
                            Attribute type
                        </Label>
                        <Select value={attributeType} onValueChange={handleAttributeTypeChange}>
                            <SelectTrigger id="attribute-type">
                                <SelectValue placeholder="Select a type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="date">Date</SelectItem>
                                <SelectItem value="category">Category</SelectItem>
                                <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {attributeType === 'category' && (
                        <div className="space-y-2">
                            <Label>Category configuration</Label>
                            {categories.map((category, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <div className="flex-grow">
                                        <Input 
                                            value={category}
                                            onChange={(e) => handleCategoryChange(index, e.target.value)}
                                            placeholder={`Category ${index + 1}`}
                                            className={cn(errors.categories && "border-destructive")}
                                        />
                                    </div>
                                    {index === categories.length - 1 && (
                                        <Button variant="outline" size="icon" onClick={addCategory} className="shrink-0">
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                            {errors.categories && <p className="text-sm text-destructive flex items-center gap-1.5"><Info className="h-4 w-4" />{errors.categories}</p>}
                        </div>
                    )}

                    {attributeType === 'multiple-choice' && (
                        <div className="space-y-2">
                            <Label>Options</Label>
                             {options.map((option, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <div className="flex-grow">
                                        <Input 
                                            value={option}
                                            onChange={(e) => handleOptionChange(index, e.target.value)}
                                            placeholder={`Option ${index + 1}`}
                                            className={cn(errors.options && "border-destructive")}
                                        />
                                    </div>
                                    {index === options.length - 1 && (
                                        <Button variant="outline" size="icon" onClick={addOption} className="shrink-0">
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                             {errors.options && <p className="text-sm text-destructive flex items-center gap-1.5"><Info className="h-4 w-4" />{errors.options}</p>}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" onClick={handleSubmit} disabled={isSubmitDisabled}>Add attribute</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export default function SegmentsPage() {
  const [segments, setSegments] = useState(initialSegments);
  const [customAttributes, setCustomAttributes] = useState(initialCustomAttributes);
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const totalPages = Math.ceil(customAttributes.length / ITEMS_PER_PAGE);

  useEffect(() => {
    const newSegmentJson = sessionStorage.getItem('newSegment');
    if (newSegmentJson) {
      try {
        const newSegment = JSON.parse(newSegmentJson);
        setSegments(prev => [newSegment, ...prev]);
        sessionStorage.removeItem('newSegment'); 
      } catch (e) {
        console.error("Failed to parse new segment from sessionStorage", e);
      }
    }
  }, []);

  const paginatedAttributes = customAttributes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };
  
  const handleAddAttribute = (name: string, type: string) => {
    const newAttribute = { name, type };
    setCustomAttributes(prev => [newAttribute, ...prev]);
  }

  const handleRemoveAttribute = (name: string) => {
    setCustomAttributes(prev => prev.filter(attr => attr.name !== name));
  };


  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Segments</h1>
          <p className="text-muted-foreground">Create and manage your user segments.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <FileUp className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button asChild>
            <Link href="/segments/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                New Segment
            </Link>
          </Button>
        </div>
      </div>
      
       <Card className="relative overflow-hidden transition-shadow hover:shadow-lg bg-card">
          <div className="p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex-1 space-y-3">
                  <h2 className="text-xl font-semibold">Build Your Audience</h2>
                  <p className="text-muted-foreground max-w-lg">
                      Group users based on their actions (like clicks or purchases) and properties (like location or tags) to send highly relevant notifications.
                  </p>
                   <div className="flex items-center gap-2 pt-2">
                        <Button asChild>
                            <Link href="/segments/new">
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Create Segment
                            </Link>
                        </Button>
                        <Button variant="outline">
                            <BookOpen className="mr-2 h-4 w-4" />
                            Read Guide
                        </Button>
                    </div>
              </div>
              <div className="hidden md:block w-48 h-48 relative">
                   <Image 
                      src="https://cdn.jsdelivr.net/gh/firebounty/sw-assests@main/segmentation-ill.png" 
                      alt="Segmentation Illustration"
                      layout="fill"
                      objectFit="contain"
                    />
              </div>
          </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Segments</CardTitle>
          <CardDescription>Manage your existing static and dynamic segments.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subscribers</TableHead>
                <TableHead>Criteria</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((segment) => (
                <TableRow key={segment.name}>
                  <TableCell className="font-medium">{segment.name}</TableCell>
                  <TableCell>
                    <Badge variant={segment.type === 'Dynamic' ? 'default' : 'secondary'}>
                      {segment.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{segment.subscribers}</TableCell>
                  <TableCell className="text-muted-foreground">{segment.criteria}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Custom attributes</CardTitle>
            <Button onClick={() => setIsDialogOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add custom attribute
            </Button>
        </CardHeader>
        <CardContent>
             <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Attribute name</TableHead>
                    <TableHead>Attribute type</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAttributes.map((attribute) => (
                    <TableRow key={attribute.name}>
                      <TableCell className="font-medium text-muted-foreground py-2">{attribute.name}</TableCell>
                      <TableCell className="text-muted-foreground py-2">{attribute.type}</TableCell>
                      <TableCell className="py-2">
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => handleRemoveAttribute(attribute.name)}>
                              <Trash2 className="h-4 w-4" />
                          </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
        </CardContent>
        <CardFooter className="flex justify-end items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevPage} disabled={currentPage === 1}>
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
                {currentPage} / {totalPages}
            </span>
             <Button variant="outline" size="icon" onClick={handleNextPage} disabled={currentPage === totalPages}>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </CardFooter>
      </Card>

      <AddAttributeDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        onAddAttribute={handleAddAttribute}
        existingAttributes={customAttributes}
      />

    </div>
  );
}
