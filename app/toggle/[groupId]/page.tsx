import { getGroupScore } from "@/lib/toggle-score";

type PageParams = {
  groupId: string;
};

function roleClass(role: "idle" | "active" | "challenger") {
  if (role === "active") return "text-blue-400";
  if (role === "challenger") return "text-red-400";
  return "text-green-400";
}

export default async function ToggleGroupPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const groupId = (await params).groupId;
  const score = await getGroupScore(groupId);
  const leader =
    [...score.devices].sort((left, right) => right.points - left.points)[0] ??
    null;

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">Toggle Leaderboard</h1>
      <p className="text-sm text-neutral-500">
        Group: {score.groupId} | Events: {score.totalEvents} | Updated:{" "}
        {new Date(score.asOf).toLocaleString()}
      </p>
      {leader ? (
        <p className="text-sm">
          Leader: <span className="font-semibold">{leader.deviceId}</span> (
          {leader.points}s)
        </p>
      ) : null}
      <ul className="space-y-2">
        {score.devices.map((device) => (
          <li
            key={device.deviceId}
            className="rounded border border-neutral-800 p-3 flex items-center justify-between"
          >
            <div>
              <p className="font-medium">{device.deviceId}</p>
              <p className={`text-sm ${roleClass(device.role)}`}>
                {device.role.toUpperCase()} | state: {device.state}
              </p>
            </div>
            <p className="text-lg font-semibold">{device.points}s</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
