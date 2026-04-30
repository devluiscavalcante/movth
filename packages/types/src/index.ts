export type PlanName = "Basic" | "Standard" | "Premium";

export type DeviceType = "web" | "ios" | "android" | "smart_tv" | "console";

export type ApiHealthResponse = {
  status: "ok";
  service: "movth-api";
};

export type TranscodeJobPayload = {
  videoAssetId: string;
  sourceS3Key: string;
  outputPrefix: string;
};
