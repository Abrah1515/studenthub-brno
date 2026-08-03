import type { ConnectorContext, ConnectorResult } from "@/lib/sources/types";
import { parseHtml } from "@/lib/sources/connectors/html";
import { parseIcs } from "@/lib/sources/connectors/ics";
import { parseJson } from "@/lib/sources/connectors/json";
import { parsePdf } from "@/lib/sources/connectors/pdf";

export function runConnector(context: ConnectorContext): Promise<ConnectorResult> {
  if (context.source.format === "ics") return parseIcs(context);
  if (context.source.format === "json" || context.source.format === "api") return parseJson(context);
  if (context.source.format === "html" || context.source.format === "xml") return parseHtml(context);
  return parsePdf(context);
}
