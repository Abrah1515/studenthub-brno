import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { artifactRoot } from "./environment.mjs";
import { vercelGet, project } from "./vercel-client.mjs";

const envResult = await vercelGet(`/v9/projects/${project.projectId}/env`);
const domains = await vercelGet(`/v9/projects/${project.projectId}/domains`);
const deployments = await vercelGet("/v6/deployments");
const report = {
  at: new Date().toISOString(),
  project: project.projectName,
  environment: Object.fromEntries((envResult.envs || []).filter(e => e.target?.includes("production")).map(e => [e.key, {configured:true, type:e.type}])),
  domains: (domains.domains||[]).map(d=>({name:d.name,verified:d.verified,redirect:d.redirect,redirectStatusCode:d.redirectStatusCode})),
  deployments:(deployments.deployments||[]).filter(d=>d.projectId===project.projectId && d.target==="production").slice(0,1).map(d=>({id:d.uid,url:d.url,state:d.state,sha:d.meta?.githubCommitSha,created:d.created,target:d.target})),
};
await mkdir(artifactRoot,{recursive:true});
await writeFile(join(artifactRoot,"vercel.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
