// src/ai/flows/suggest-campaign-improvements.ts
'use server';

/**
 * @fileOverview Provides AI-powered tips for improving campaigns and automations.
 *
 * - suggestCampaignImprovements - A function that generates suggestions for campaign improvement.
 * - SuggestCampaignImprovementsInput - The input type for the suggestCampaignImprovements function.
 * - SuggestCampaignImprovementsOutput - The return type for the suggestCampaignImprovements function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestCampaignImprovementsInputSchema = z.object({
  campaignName: z.string().describe('The name of the campaign.'),
  campaignDescription: z.string().describe('The description of the campaign.'),
  targetAudience: z.string().describe('The target audience for the campaign.'),
  campaignGoal: z.string().describe('The goal of the campaign (e.g., increase sales, drive traffic).'),
  currentPerformance: z
    .string()
    .optional()
    .describe('Optional: Information about the campaign performance to date.'),
});
export type SuggestCampaignImprovementsInput = z.infer<typeof SuggestCampaignImprovementsInputSchema>;

const SuggestCampaignImprovementsOutputSchema = z.object({
  suggestions: z.array(z.string()).describe('A list of AI-powered suggestions for improving the campaign.'),
});
export type SuggestCampaignImprovementsOutput = z.infer<typeof SuggestCampaignImprovementsOutputSchema>;

export async function suggestCampaignImprovements(input: SuggestCampaignImprovementsInput): Promise<SuggestCampaignImprovementsOutput> {
  return suggestCampaignImprovementsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestCampaignImprovementsPrompt',
  input: {schema: SuggestCampaignImprovementsInputSchema},
  output: {schema: SuggestCampaignImprovementsOutputSchema},
  prompt: `You are an AI assistant designed to provide actionable tips for improving marketing campaigns.

  Analyze the following campaign information and suggest specific improvements:

  Campaign Name: {{{campaignName}}}
  Campaign Description: {{{campaignDescription}}}
  Target Audience: {{{targetAudience}}}
  Campaign Goal: {{{campaignGoal}}}
  Current Performance (if available): {{{currentPerformance}}}

  Provide a list of suggestions that are clear, concise, and directly applicable to the provided campaign details.
  Focus on areas such as:
  - Improving the campaign description for better engagement.
  - Refining the target audience to reach the most receptive users.
  - Aligning the campaign with the stated goal.
  - Optimizing campaign timing and frequency.
  - Suggesting personalized copy based on the customer's profile or purchase history
  - Suggesting A/B tests for copy variants
  `,
});

const suggestCampaignImprovementsFlow = ai.defineFlow(
  {
    name: 'suggestCampaignImprovementsFlow',
    inputSchema: SuggestCampaignImprovementsInputSchema,
    outputSchema: SuggestCampaignImprovementsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
