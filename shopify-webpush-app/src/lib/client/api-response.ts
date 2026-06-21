export const parseApiResponse = async (
  response: Response,
): Promise<{ json: unknown | null; text: string }> => {
  const text = await response.text();

  if (!text.trim()) {
    return { json: null, text: '' };
  }

  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
};
