export type PublicProfileIdentity = {
  username: string | null;
  displayName: string;
  avatarUrl?: string;
  universityId?: string;
  facultyId?: string;
  studyProgram?: string;
  studyYear?: number;
  verifiedEmail: boolean;
  legacy: boolean;
};

export const legacyProfileIdentity: PublicProfileIdentity = { username: null, displayName: "Původní anonymní příspěvek", verifiedEmail: false, legacy: true };
