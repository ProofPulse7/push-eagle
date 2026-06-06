/**
 * Vercel / .env values are sometimes saved with wrapping quotes that become part of the URL.
 * The Neon driver rejects those as invalid connection strings.
 */
export const sanitizePostgresConnectionString = (value: string) => {
  let trimmed = value.trim();

  while (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  return trimmed;
};

export const isValidPostgresConnectionString = (value: string) => {
  const cleaned = sanitizePostgresConnectionString(value);
  if (!cleaned) {
    return false;
  }

  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:';
  } catch {
    return /^postgres(ql)?:\/\//i.test(cleaned);
  }
};
