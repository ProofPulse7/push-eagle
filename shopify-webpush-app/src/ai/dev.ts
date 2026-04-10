import { config } from 'dotenv';
config();

import '@/ai/flows/answer-dashboard-query.ts';
import '@/ai/flows/suggest-notification-copy.ts';
import '@/ai/flows/predict-send-time.ts';
import '@/ai/flows/suggest-campaign-improvements.ts';
import '@/ai/flows/generate-ab-test-variants.ts';