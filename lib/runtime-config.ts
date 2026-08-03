type RuntimeEnvironment = Record<string, string | undefined>;

const productionSecrets = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "ADMIN_COOKIE_SECRET", "RATE_LIMIT_SALT"] as const;
const unsafeProductionFlags = ["DEMO_MODE", "ALLOW_LOCAL_FILE_STORE", "ALLOW_VERIFIED_FALLBACK"] as const;

export function isProductionDeployment(environment: RuntimeEnvironment) {
  return environment.APP_ENV === "production" || environment.VERCEL_ENV === "production";
}

export function productionConfigurationErrors(environment: RuntimeEnvironment) {
  if (!isProductionDeployment(environment)) return [];
  const errors: string[] = [];
  for (const name of productionSecrets) if (!environment[name]?.trim()) errors.push(`Chybí povinná produkční proměnná ${name}.`);
  for (const name of unsafeProductionFlags) if (environment[name] === "true") errors.push(`${name}=true je v produkci zakázáno.`);
  if (environment.NEXT_PUBLIC_SUPABASE_URL && !/^https:\/\/[^/]+\.supabase\.co\/?$/i.test(environment.NEXT_PUBLIC_SUPABASE_URL)) errors.push("NEXT_PUBLIC_SUPABASE_URL musí být HTTPS URL Supabase projektu.");
  return errors;
}

export function assertProductionConfiguration(environment: RuntimeEnvironment = process.env) {
  const errors = productionConfigurationErrors(environment);
  if (errors.length) throw new Error(`Neplatná produkční konfigurace StudentHubu:\n- ${errors.join("\n- ")}`);
}
