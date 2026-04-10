import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { merchantConfig } from "./merchant";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, compact = false): string {
  try {
    const options: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: merchantConfig.currency,
    };
    if (compact) {
        options.notation = 'compact';
        options.minimumFractionDigits = 0;
        options.maximumFractionDigits = 1;
    } else {
        options.minimumFractionDigits = 2;
        options.maximumFractionDigits = 2;
    }

    return new Intl.NumberFormat(merchantConfig.locale, options).format(value);
  } catch (error) {
    console.error("Error formatting currency:", error);
    // Fallback for invalid config
    return `$${value.toFixed(2)}`;
  }
}

export function formatNumber(value: number): string {
    try {
        return new Intl.NumberFormat(merchantConfig.locale).format(value);
    } catch (error) {
        console.error("Error formatting number:", error);
        return value.toString();
    }
}
