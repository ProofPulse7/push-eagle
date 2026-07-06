export const normalizeCatalogToken = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');

const tokenizeCatalog = (value: string) => normalizeCatalogToken(value).split(' ').filter(Boolean);

export const isProductSearchQueryReady = (query: string) => {
  const tokens = tokenizeCatalog(query);
  if (tokens.length === 0) {
    return false;
  }

  // Avoid broad one-letter searches like "s".
  if (tokens.every((token) => token.length < 3)) {
    return false;
  }

  return tokens.some((token) => token.length >= 3);
};

export const productTitleMatchesQuery = (title: string, query: string) => {
  const titleTokens = tokenizeCatalog(title);
  const queryTokens = tokenizeCatalog(query);
  if (queryTokens.length === 0 || titleTokens.length === 0) {
    return false;
  }

  let titleIndex = 0;
  for (const queryToken of queryTokens) {
    let matched = false;
    while (titleIndex < titleTokens.length) {
      const titleToken = titleTokens[titleIndex];
      if (titleToken.startsWith(queryToken)) {
        matched = true;
        titleIndex += 1;
        break;
      }
      titleIndex += 1;
    }
    if (!matched) {
      return false;
    }
  }

  return true;
};

export const toSqlLikePattern = (value: string) => `%${normalizeCatalogToken(value).replace(/[%_]/g, '')}%`;

export const toSqlPrefixPattern = (value: string) => `${normalizeCatalogToken(value).replace(/[%_]/g, '')}%`;

export const fuzzyContains = (haystack: string, needle: string) => productTitleMatchesQuery(haystack, needle);

export type SegmentCatalogOption = {
  value: string;
  label: string;
  handle?: string | null;
  kind: 'product' | 'collection';
};
