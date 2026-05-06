export type PlanName = "Basic" | "Standard" | "Premium";

export type DeviceType = "web" | "ios" | "android" | "smart_tv" | "console";

export type ApiHealthResponse = {
  status: "ok";
  service: "movth-api";
};

export type TranscodeJobPayload = {
  titleId: string;
  episodeId?: string;
  s3Key: string;
  type: "movie" | "episode";
};

export type PlaybackSource = "HLS" | "EMBED";
