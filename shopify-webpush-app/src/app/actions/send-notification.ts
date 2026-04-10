
'use server';

import { z } from 'zod';

import { sendWebPushToToken } from '@/lib/integrations/firebase/admin';

const fcmTokenSchema = z.string().min(1);

const notificationPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  icon: z.string().url().optional().nullable(),
  image: z.string().url().optional().nullable(),
  url: z.string().url().optional().nullable()
});

export async function sendTestNotification(token: string, payloadJson: any) {
  try {
    const fcmToken = fcmTokenSchema.parse(token);
    const payloadData = notificationPayloadSchema.parse(payloadJson);

    const messageId = await sendWebPushToToken(fcmToken, {
      title: payloadData.title,
      body: payloadData.body,
      icon: payloadData.icon,
      image: payloadData.image,
      url: payloadData.url,
    });

    return { success: true, messageId };
  } catch (error) {
    console.error('Error sending push notification:', error);
    
    let errorMessage = 'Failed to send notification.';
    if (error instanceof z.ZodError) {
        errorMessage = 'Invalid data provided for notification.';
    } else if (error instanceof Error) {
        errorMessage = error.message;
    }

    return { success: false, error: errorMessage };
  }
}
