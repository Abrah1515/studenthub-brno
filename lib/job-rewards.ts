import type { Job } from "@/lib/types";

const unitLabels: Record<NonNullable<Job["rewardUnit"]>, string> = {
  hour: "hod.", day: "den", shift: "směna", month: "měsíc", agreement: "dle domluvy", fixed: "úkol", volunteer: "dobrovolnictví",
};

export function formatJobReward(job: Pick<Job, "reward" | "rewardMin" | "rewardMax" | "rewardCurrency" | "rewardUnit">) {
  if (job.rewardMin == null && job.reward != null) return `${new Intl.NumberFormat("cs-CZ").format(job.reward)} Kč/h`;
  if (job.rewardUnit === "agreement" && job.rewardMin == null) return "Dle domluvy";
  if (job.rewardUnit === "volunteer" && job.rewardMin == null) return "Dobrovolnictví";
  if (job.rewardMin == null || !job.rewardCurrency || !job.rewardUnit) return "Odměna neuvedena";
  const format = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 });
  const amount = job.rewardMax != null && job.rewardMax !== job.rewardMin ? `${format.format(job.rewardMin)}–${format.format(job.rewardMax)}` : format.format(job.rewardMin);
  const currency = job.rewardCurrency === "CZK" ? "Kč" : job.rewardCurrency;
  return `${amount} ${currency} / ${unitLabels[job.rewardUnit]}`;
}
