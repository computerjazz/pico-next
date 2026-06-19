import { Device } from "@/db/schema";
import { claimDevice } from "@/app/actions/claimDevice";
import { auth } from "@/auth";
import PillButton from "./PillButton";

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
      <PillButton label="Claim" type="submit" />
    </form>
  );
}

export default ClaimButton;
