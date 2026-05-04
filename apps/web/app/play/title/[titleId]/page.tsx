import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PROFILE_COOKIE, requireUser, serverApi } from "../../../lib/session";

type PlayTitlePageProps = {
  params: {
    titleId: string;
  };
};

type PlayTitleResponse = {
  titleId: string;
  assetId: string;
  episodeId: string | null;
  reason: "movie" | "resume" | "first_episode";
};

export default async function PlayTitlePage({ params }: PlayTitlePageProps) {
  await requireUser();
  const profileId = cookies().get(PROFILE_COOKIE)?.value;

  if (!profileId) {
    redirect("/profiles");
  }

  const result = await serverApi<PlayTitleResponse>(
    `/play/title/${params.titleId}?profileId=${profileId}`
  );

  if (!result.ok || !result.body.data) {
    redirect(`/title/${params.titleId}`);
  }

  redirect(`/watch/${result.body.data.assetId}`);
}
