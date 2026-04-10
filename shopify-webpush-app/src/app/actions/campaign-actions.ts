
'use server';

import { revalidatePath } from 'next/cache';

export async function archiveCampaign(campaignId: string) {
    console.log("Attempting to archive campaign:", campaignId);

    if (!campaignId) {
        return { success: false, error: "Campaign ID is required." };
    }

    try {
        // Simulate archiving
        console.log(`Campaign ${campaignId} has been marked as 'Archived'.`);
        
        revalidatePath('/campaigns');
        return { success: true };

    } catch (error) {
        console.error("Error archiving campaign:", error);
        let errorMessage = 'Failed to archive campaign.';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        return { success: false, error: errorMessage };
    }
}
