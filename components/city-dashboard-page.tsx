import { CityDashboardContent } from "@/components/city-dashboard-content";
import type { City } from "@/lib/cities";
import { getAcademicEvents, getJobs, getOffers, getPlaces } from "@/lib/public-data";

export async function CityDashboard({ city }: { city: City }) {
  const [events, places, offers, jobs] = await Promise.all([getAcademicEvents(city.id), getPlaces(city.id), getOffers(city.id), getJobs(city.id)]);
  return <CityDashboardContent city={city} events={events} places={places} offers={offers} jobs={jobs} />;
}
