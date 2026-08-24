export const communityCategories = ["Kafe a jídlo", "Studium", "Bydlení", "Doprava", "Akce", "Technika", "Tipy po Brně", "Ostatní"] as const;
export type CommunityCategory = (typeof communityCategories)[number];

export type CommunityPlace = { id: string; name: string; address: string; latitude: number; longitude: number };
export type CommunityComment = {
  id: string; postId: string; nickname: string; body: string; isBest: boolean; helpfulCount: number;
  createdAt: string; updatedAt: string; owned: boolean; viewerHelpful: boolean; author: PublicProfileIdentity;
};
export type CommunityPost = {
  id: string; nickname: string; category: CommunityCategory; body: string; imageUrl?: string; place?: CommunityPlace;
  universityId?: string; facultyId?: string; helpfulCount: number; commentCount: number; createdAt: string; updatedAt: string;
  owned: boolean; viewerHelpful: boolean; author: PublicProfileIdentity;
};

export const communityReportReasons = [
  ["spam", "Spam"], ["harassment", "Obtěžování"], ["hate", "Nenávistný obsah"],
  ["privacy", "Osobní údaje"], ["fraud", "Podvod"], ["dangerous", "Nebezpečný obsah"], ["other", "Ostatní"],
] as const;
import type { PublicProfileIdentity } from "@/lib/profile-types";
