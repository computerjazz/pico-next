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
        className="inline-flex items-center px-3 py-1 rounded-full bg-gray-800 text-gray-400 text-sm font-medium hover:bg-blue-200 transition cursor-pointer border-2"
      >
        Claim
      </button>
    </form>
  );
}

export default ClaimButton;
