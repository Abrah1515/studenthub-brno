export type PublicFeatureFlags = Readonly<{
  offersEnabled: boolean;
}>;

export const featureFlags: PublicFeatureFlags = Object.freeze({
  offersEnabled: process.env.NEXT_PUBLIC_OFFERS_ENABLED === "true",
});
