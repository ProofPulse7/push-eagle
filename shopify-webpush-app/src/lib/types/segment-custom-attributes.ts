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
  { name: 'LASTNAME', type: 'text', isSystem: true },
  { name: 'FIRSTNAME', type: 'text', isSystem: true },
  { name: 'CONTACT_TIMEZONE', type: 'text', isSystem: true },
  { name: 'NOTE', type: 'text', isSystem: true },
  { name: 'COMPANY', type: 'text', isSystem: true },
  { name: 'PURCHASE_COUNT', type: 'number', isSystem: true },
  { name: 'LAST_PURCHASE_DATE', type: 'date', isSystem: true },
  { name: 'COUNTRY', type: 'text', isSystem: true },
  { name: 'PROVINCE', type: 'text', isSystem: true },
  { name: 'COUNTRY_CODE', type: 'text', isSystem: true },
  { name: 'PROVINCE_CODE', type: 'text', isSystem: true },
  { name: 'CITY', type: 'text', isSystem: true },
  { name: 'ZIP', type: 'text', isSystem: true },
];

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
