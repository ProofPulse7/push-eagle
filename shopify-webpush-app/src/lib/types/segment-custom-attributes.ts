export type SegmentCustomAttributeType =
  | 'text'
  | 'number'
  | 'date'
  | 'category'
  | 'multiple-choice';

export type SegmentCustomAttribute = {
  name: string;
  type: SegmentCustomAttributeType;
  options?: string[];
  isSystem?: boolean;
  createdAt?: string;
};

export const SYSTEM_SEGMENT_CUSTOM_ATTRIBUTES: SegmentCustomAttribute[] = [
  { name: 'FIRSTNAME', type: 'text', isSystem: true },
  { name: 'LASTNAME', type: 'text', isSystem: true },
  { name: 'COUNTRY', type: 'text', isSystem: true },
  { name: 'CITY', type: 'text', isSystem: true },
  { name: 'PROVINCE', type: 'text', isSystem: true },
  { name: 'PURCHASE_COUNT', type: 'number', isSystem: true },
  { name: 'LAST_PURCHASE_DATE', type: 'date', isSystem: true },
];

/** Retired built-ins that are no longer seeded or shown (no reliable subscriber data). */
export const RETIRED_SYSTEM_SEGMENT_CUSTOM_ATTRIBUTES = [
  'CONTACT_TIMEZONE',
  'NOTE',
  'COMPANY',
  'COUNTRY_CODE',
  'PROVINCE_CODE',
  'ZIP',
] as const;

export const formatSegmentAttributeType = (type: string) => {
  switch (type) {
    case 'multiple-choice':
      return 'Multiple choice';
    case 'category':
      return 'Category';
    case 'number':
      return 'Number';
    case 'date':
      return 'Date';
    default:
      return 'Text';
  }
};
