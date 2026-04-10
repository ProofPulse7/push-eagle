// This file is machine-generated - edit at your own risk.

'use server';

/**
 * @fileOverview This file contains a Genkit flow that generates A/B test copy variants for campaign creators.
 *
 * The flow takes a campaign description and generates multiple copy variants for A/B testing.
 * - generateABTestVariants - A function that handles the generation of A/B test copy variants.
 * - GenerateABTestVariantsInput - The input type for the generateABTestVariants function.
 * - GenerateABTestVariantsOutput - The return type for the generateABTestVariants function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateABTestVariantsInputSchema = z.object({
  campaignDescription: z
    .string()
    .describe('The description of the campaign for which to generate A/B test copy variants.'),
  numberOfVariants: z
    .number()
    .default(3)
    .describe('The number of A/B test copy variants to generate.  Must be between 2 and 5 inclusive.'),
});
export type GenerateABTestVariantsInput = z.infer<
  typeof GenerateABTestVariantsInputSchema
>;

const GenerateABTestVariantsOutputSchema = z.object({
  variants: z
    .array(z.string())
    .describe('An array of A/B test copy variants for the campaign.'),
});
export type GenerateABTestVariantsOutput = z.infer<
  typeof GenerateABTestVariantsOutputSchema
>;

export async function generateABTestVariants(
  input: GenerateABTestVariantsInput
): Promise<GenerateABTestVariantsOutput> {
  return generateABTestVariantsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateABTestVariantsPrompt',
  input: {schema: GenerateABTestVariantsInputSchema},
  output: {schema: GenerateABTestVariantsOutputSchema},
  prompt: `You are an expert copywriter specializing in creating high-converting A/B test variants for marketing campaigns.

  Given the following campaign description, generate {{numberOfVariants}} different copy variants for A/B testing. The copy variants should be distinct and explore different angles or value propositions.

  Campaign Description: {{{campaignDescription}}}

  Your response should be a JSON object with a single key named "variants". The value of "variants" should be an array of strings, where each string is a copy variant.
  Ensure you don't repeat any variants.
  Example:
  {
    "variants": [
      "Variant 1 copy",
      "Variant 2 copy",
      "Variant 3 copy"
    ]
  }`,
});

const generateABTestVariantsFlow = ai.defineFlow(
  {
    name: 'generateABTestVariantsFlow',
    inputSchema: GenerateABTestVariantsInputSchema,
    outputSchema: GenerateABTestVariantsOutputSchema,
  },
  async input => {
    if (input.numberOfVariants < 2 || input.numberOfVariants > 5) {
      throw new Error(
        'The number of variants must be between 2 and 5 inclusive.'
      );
    }

    const {output} = await prompt(input);
    return output!;
  }
);
