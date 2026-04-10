// This file is machine-generated - edit at your own risk!

'use server';

/**
 * @fileOverview Implements the answerDashboardQuery flow, allowing users to query dashboard data using natural language.
 *
 * - answerDashboardQuery - A function that processes user queries to retrieve and format dashboard data.
 * - AnswerDashboardQueryInput - The input type for the answerDashboardQuery function.
 * - AnswerDashboardQueryOutput - The return type for the answerDashboardQuery function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnswerDashboardQueryInputSchema = z.object({
  query: z.string().describe('The natural language query from the user.'),
});
export type AnswerDashboardQueryInput = z.infer<typeof AnswerDashboardQueryInputSchema>;

const AnswerDashboardQueryOutputSchema = z.object({
  answer: z.string().describe('The answer to the user query, based on the dashboard data.'),
});
export type AnswerDashboardQueryOutput = z.infer<typeof AnswerDashboardQueryOutputSchema>;

export async function answerDashboardQuery(input: AnswerDashboardQueryInput): Promise<AnswerDashboardQueryOutput> {
  return answerDashboardQueryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'answerDashboardQueryPrompt',
  input: {schema: AnswerDashboardQueryInputSchema},
  output: {schema: AnswerDashboardQueryOutputSchema},
  prompt: `You are an AI assistant that helps users understand their campaign performance based on dashboard data.
  You will receive a natural language query from the user and should provide a clear and concise answer based on the available data.

  User Query: {{{query}}}
  `,
});

const answerDashboardQueryFlow = ai.defineFlow(
  {
    name: 'answerDashboardQueryFlow',
    inputSchema: AnswerDashboardQueryInputSchema,
    outputSchema: AnswerDashboardQueryOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    return output!;
  }
);
