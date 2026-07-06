export type OptInPromptType = 'browser' | 'custom';

export type OptInPromptTypeStats = {
  views: number;
  clicks: number;
  conversions: number;
  conversionPercent: number;
  clickConversionPercent: number;
};

export type OptInPromptStatsBundle = {
  browser: OptInPromptTypeStats;
  custom: OptInPromptTypeStats;
  totals: {
    views: number;
    clicks: number;
    conversions: number;
    conversionPercent: number;
    avgConversionPercent: number;
    avgClickConversionPercent: number;
  };
};
