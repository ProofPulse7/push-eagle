const normalizeKey = (value: string | null | undefined) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ');

const PK_CITY_TO_REGION: Record<string, string> = {
  karachi: 'Sindh',
  hyderabad: 'Sindh',
  sukkur: 'Sindh',
  larkana: 'Sindh',
  nawabshah: 'Sindh',
  mirpurkhas: 'Sindh',
  thatta: 'Sindh',
  jamshoro: 'Sindh',
  lahore: 'Punjab',
  faisalabad: 'Punjab',
  rawalpindi: 'Punjab',
  multan: 'Punjab',
  gujranwala: 'Punjab',
  sialkot: 'Punjab',
  bahawalpur: 'Punjab',
  sargodha: 'Punjab',
  gujrat: 'Punjab',
  sheikhupura: 'Punjab',
  jhelum: 'Punjab',
  sahiwal: 'Punjab',
  peshawar: 'Khyber Pakhtunkhwa',
  mardan: 'Khyber Pakhtunkhwa',
  abbottabad: 'Khyber Pakhtunkhwa',
  mingora: 'Khyber Pakhtunkhwa',
  quetta: 'Balochistan',
  turbat: 'Balochistan',
  gwadar: 'Balochistan',
  islamabad: 'Islamabad',
  muzaffarabad: 'Azad Kashmir',
};

const REGION_CODE_TO_NAME: Record<string, string> = {
  sd: 'Sindh',
  sindh: 'Sindh',
  pb: 'Punjab',
  punjab: 'Punjab',
  kp: 'Khyber Pakhtunkhwa',
  kpk: 'Khyber Pakhtunkhwa',
  'khyber pakhtunkhwa': 'Khyber Pakhtunkhwa',
  ba: 'Balochistan',
  balochistan: 'Balochistan',
  is: 'Islamabad',
  islamabad: 'Islamabad',
};

export const normalizeRegion = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  const keyed = normalizeKey(trimmed);
  if (REGION_CODE_TO_NAME[keyed]) {
    return REGION_CODE_TO_NAME[keyed];
  }

  return trimmed
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(' ');
};

export const inferRegionFromCityCountry = (
  city: string | null | undefined,
  country: string | null | undefined,
) => {
  const cityKey = normalizeKey(city);
  const countryKey = normalizeKey(country);

  if (!cityKey) {
    return null;
  }

  if (countryKey === 'pk' || countryKey === 'pakistan') {
    return PK_CITY_TO_REGION[cityKey] ?? null;
  }

  return null;
};
