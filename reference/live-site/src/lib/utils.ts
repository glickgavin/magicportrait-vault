import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Round a number to 2 decimal places using ceiling (round up)
 * to match Shopify's pricing calculations.
 * Shopify floors the discount amount per item, which means the
 * resulting price is effectively ceiled to the next cent.
 */
export function shopifyRound(value: number): number {
  return Math.ceil(value * 100) / 100;
}
