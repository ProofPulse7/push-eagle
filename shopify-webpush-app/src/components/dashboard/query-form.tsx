'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, Loader2, Sparkles } from 'lucide-react';
import { suggestCampaignImprovements } from '@/ai/flows/suggest-campaign-improvements';

const tips = [
    "Try segmenting your 'New Subscribers' with a welcome series to improve initial engagement.",
    "A/B test your 'Summer Sale' notification titles to see which one drives more clicks. Try a title with an emoji!",
    "Your click rate on weekends is 20% higher. Consider scheduling your next major announcement for a Saturday morning."
];

export function QueryForm() {
  const [insight, setInsight] = useState(tips[0]);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateInsight = async () => {
    setIsLoading(true);
    try {
        // In a real app, you would pass real campaign data here.
        const result = await suggestCampaignImprovements({
            campaignName: "General Performance",
            campaignDescription: "Overall account performance for the last quarter.",
            targetAudience: "All subscribers",
            campaignGoal: "Increase overall engagement and sales"
        });
        if (result.suggestions.length > 0) {
            setInsight(result.suggestions[0]);
        } else {
            // Fallback if AI returns no suggestions
            setInsight(tips[Math.floor(Math.random() * tips.length)]);
        }
    } catch (error) {
        console.error("Failed to fetch AI insight:", error);
        // Fallback to a random pre-canned tip on error
        setInsight(tips[Math.floor(Math.random() * tips.length)]);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Card>
        <CardHeader className="flex flex-row items-start gap-4">
            <div className="bg-primary/10 p-2 rounded-full">
                <Lightbulb className="h-5 w-5 text-primary" />
            </div>
            <div className="grid gap-1">
                <CardTitle>AI Insights</CardTitle>
                <CardDescription>Actionable tips to improve your performance.</CardDescription>
            </div>
        </CardHeader>
        <CardContent className="space-y-4">
           <p className="text-sm text-muted-foreground leading-relaxed">
            {insight}
           </p>
           <Button onClick={handleGenerateInsight} disabled={isLoading} className="w-full">
                {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                )}
                {isLoading ? 'Generating...' : 'Get New Tip'}
            </Button>
        </CardContent>
    </Card>
  );
}
