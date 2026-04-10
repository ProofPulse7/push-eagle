// src/ai/flows/predict-send-time.ts
'use server';

/**
 * @fileOverview Predicts the optimal send time for a push notification based on subscriber behavior.
 *
 * - predictSendTime - A function that predicts the optimal send time.
 * - PredictSendTimeInput - The input type for the predictSendTime function.
 * - PredictSendTimeOutput - The return type for the predictSendTime function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PredictSendTimeInputSchema = z.object({
  subscriberData: z
    .string()
    .describe(
      'Aggregated data about subscriber behavior, including past engagement times, purchase history, location, and demographics.'
    ),
  campaignDetails: z
    .string()
    .describe('Details about the push notification campaign, including content, target audience, and goals.'),
  desiredTimeZone: z
    .string()
    .optional()
    .describe('The desired timezone in which to send the notification, if not provided the subscriber timezone is assumed.'),
});
export type PredictSendTimeInput = z.infer<typeof PredictSendTimeInputSchema>;

const PredictSendTimeOutputSchema = z.object({
  predictedSendTime: z
    .string()
    .describe(
      'The predicted optimal send time, in ISO 8601 format (e.g., 2024-01-01T10:00:00Z), based on subscriber behavior and campaign details.'
    ),
  explanation: z
    .string()
    .describe(
      'An explanation of why this send time is predicted to be optimal, considering factors like past engagement, time zone, and campaign content.'
    ),
});
export type PredictSendTimeOutput = z.infer<typeof PredictSendTimeOutputSchema>;

export async function predictSendTime(input: PredictSendTimeInput): Promise<PredictSendTimeOutput> {
  return predictSendTimeFlow(input);
}

const predictSendTimePrompt = ai.definePrompt({
  name: 'predictSendTimePrompt',
  input: {schema: PredictSendTimeInputSchema},
  output: {schema: PredictSendTimeOutputSchema},
  prompt: `You are an expert marketing assistant specializing in push notification optimization.

  Given the following information about subscriber behavior and campaign details, predict the optimal send time to maximize engagement and conversions.

  Subscriber Data: {{{subscriberData}}}
  Campaign Details: {{{campaignDetails}}}
  Desired Timezone: {{{desiredTimeZone}}}

  Consider factors such as past engagement times, subscriber time zone, purchase history, and campaign content.

  Provide the predicted send time in ISO 8601 format (e.g., 2024-01-01T10:00:00Z) and explain why this time is predicted to be optimal.
  `,
});

const predictSendTimeFlow = ai.defineFlow(
  {
    name: 'predictSendTimeFlow',
    inputSchema: PredictSendTimeInputSchema,
    outputSchema: PredictSendTimeOutputSchema,
  },
  async input => {
    const {output} = await predictSendTimePrompt(input);
    return output!;
  }
);
