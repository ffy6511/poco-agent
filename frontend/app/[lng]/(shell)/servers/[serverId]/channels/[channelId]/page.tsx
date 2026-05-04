import { ChannelTaskPageClient } from "@/features/channel-tasks";

export default async function ServerChannelPage({
  params,
}: {
  params: Promise<{ serverId: string; channelId: string }>;
}) {
  const { serverId, channelId } = await params;
  return <ChannelTaskPageClient serverId={serverId} channelId={channelId} />;
}
