import { Device } from "@/db/schema";
import { claimDevice } from "@/app/actions/claimDevice";
import { auth } from "@/auth";

async function ClaimButton({ device }: { device: Device }) {
  const session = await auth();
  if (!session?.user?.id || device.userId) return null;
  return (
    <form
      action={async () => {
        "use server";
        await claimDevice({ deviceId: device.deviceId });
      }}
    >
      <button
        type="submit"
        className="text-xs inline-flex items-center px-3 py-1 rounded-full bg-accent-surface text-accent-foreground font-medium hover:bg-accent transition cursor-pointer border-2"
      >
        Claim
      </button>
    </form>
  );
}

export default ClaimButton;
