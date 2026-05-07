'use client';

import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

export const AbandonedCartHeroDisplay = () => {
  return (
    <div className="space-y-4 border-t pt-6 mt-4">
      <div>
        <Label className="font-medium">Hero image</Label>
        <div className="mt-2 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/30 dark:bg-amber-950/20">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              PushEagle will automatically use the product image for this push notification
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200">
              The first product from the abandoned cart will be displayed as the hero image. This is fetched directly from Shopify.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
