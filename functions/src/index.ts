/**
 * Firebase Cloud Functions (Backend) reference for anti-cheat AI credit deduction
 * and 24-hour daily free credit reset against Firestore collection `users`.
 */

export const FIRESTORE_DATABASE_ID =
  'ai-studio-hcliusgiovinsngt-cb916116-a1d6-465b-a85b-408c99d3044d';

export const DAILY_FREE_CREDITS = 20;
export const STANDARD_APP_CREDIT_COST = 3;
export const DAILY_FREE_RESET_MS = 24 * 60 * 60 * 1000;

export interface CloudFunctionContext {
  auth?: {
    uid: string;
    token?: {
      email?: string;
      email_verified?: boolean;
    };
  };
}
