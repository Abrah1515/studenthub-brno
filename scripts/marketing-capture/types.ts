import type { Page } from "@playwright/test";

export type FeatureFlowId = "intro" | "brigady" | "kalendar" | "mista" | "bydleni" | "partak" | "komunita";
export type FlowId = FeatureFlowId | "overview";
export type CaptureStatus = "completed" | "skipped" | "failed";

export type CaptureOptions = {
  baseUrl: string;
  only?: FlowId;
  headed: boolean;
  video: boolean;
  screenshots: boolean;
};

export type FlowCaptureContext = {
  screenshot: () => Promise<void>;
};

export type FlowDefinition = {
  id: FeatureFlowId;
  order: number;
  title: string;
  route: string;
  heading: RegExp;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  capture: (page: Page, context: FlowCaptureContext) => Promise<string[]>;
};

export type VideoInfo = {
  codec: string;
  width: number;
  height: number;
  durationSeconds: number;
  sizeBytes: number;
};

export type ScreenshotInfo = {
  width: number;
  height: number;
  sizeBytes: number;
};

export type FlowResult = {
  id: FlowId;
  title: string;
  status: CaptureStatus;
  route: string;
  destinationUrl: string;
  suggestedOrganicUrl: string;
  suggestedPaidUrl: string;
  video?: string;
  screenshot?: string;
  durationSeconds?: number;
  videoInfo?: VideoInfo;
  screenshotInfo?: ScreenshotInfo;
  reason?: string;
  notes: string[];
};

export type CaptureManifest = {
  version: 1;
  generatedAt: string;
  baseUrl: string;
  viewport: { width: number; height: number; aspectRatio: "9:16" };
  output: { width: number; height: number; videoCodec: "h264"; screenshotFormat: "png" };
  readOnly: true;
  flows: FlowResult[];
};
