import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, UserRound } from "lucide-react";
import type { PublicProfileIdentity } from "@/lib/profile-types";
import { faculties, universities } from "@/lib/universities";

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("cs-CZ")).join("") || "SH";
}

export function ProfileIdentity({ author, compact = false }: { author: PublicProfileIdentity; compact?: boolean }) {
  if (author.legacy) {
    return <div className={`profile-identity ${compact ? "compact" : ""}`}><span className="profile-avatar-fallback"><UserRound size={18} /></span><div><strong>Původní anonymní příspěvek</strong><small>Starší obsah bez propojeného účtu</small></div></div>;
  }
  const school = universities.find((item) => item.id === author.universityId)?.shortName;
  const faculty = faculties.find((item) => item.id === author.facultyId)?.shortName;
  const scope = [school, faculty, author.studyYear ? `${author.studyYear}. ročník` : ""].filter(Boolean).join(" · ");
  return <div className={`profile-identity ${compact ? "compact" : ""}`}>
    {author.avatarUrl ? <Image className="profile-avatar" src={author.avatarUrl} alt="" width={compact ? 36 : 44} height={compact ? 36 : 44} unoptimized /> : <span className="profile-avatar-fallback" aria-hidden="true">{initials(author.displayName)}</span>}
    <div>{author.username ? <Link href={`/profil/${encodeURIComponent(author.username)}`}><strong>{author.displayName}</strong></Link> : <strong>{author.displayName}</strong>}<small><BadgeCheck size={13} /> Ověřený e-mail{author.username ? scope ? ` · ${scope}` : "" : " · soukromý profil"}</small></div>
  </div>;
}
