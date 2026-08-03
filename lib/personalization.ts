import { academicEventMatchesSelection, type StudySelection } from "@/lib/academic-events";
import type { AcademicEvent, Job, Offer, Place } from "@/lib/types";

function audienceMatches(ids: string[] | undefined, selected?: string) {
  return !selected || !ids?.length || ids.includes(selected);
}

export function filterAcademicEvents(events: AcademicEvent[], selection: StudySelection) {
  return events.filter((event) => academicEventMatchesSelection(event, selection));
}

export function filterPlaces(places: Place[], selection: StudySelection & { campus?: string }) {
  return places.filter((place) => audienceMatches(place.universityIds, selection.universityId)
    && audienceMatches(place.facultyIds, selection.facultyId)
    && (!selection.campus || place.campusId === selection.campus || place.campus?.toLocaleLowerCase("cs-CZ") === selection.campus.toLocaleLowerCase("cs-CZ")));
}

export function filterOffers(offers: Offer[], selection: StudySelection & { campus?: string }) {
  return offers.filter((offer) => audienceMatches(offer.universityIds, selection.universityId)
    && audienceMatches(offer.facultyIds, selection.facultyId)
    && (!selection.campus || offer.campusId === selection.campus || offer.campus?.toLocaleLowerCase("cs-CZ") === selection.campus.toLocaleLowerCase("cs-CZ")));
}

export function filterJobs(jobs: Job[], selection: StudySelection) {
  return jobs.filter((job) => audienceMatches(job.universityIds, selection.universityId) && audienceMatches(job.facultyIds, selection.facultyId));
}
