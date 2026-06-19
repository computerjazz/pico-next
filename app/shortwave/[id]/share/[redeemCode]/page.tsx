import { joinDevice } from "@/app/actions/joinDevice";
import DeviceHeader from "@/app/components/DeviceHeader";
import PageHeader from "@/app/components/PageHeader";
import PillButton from "@/app/components/PillButton";
import { auth } from "@/auth";
import { db } from "@/db";
import { notFound, redirect } from "next/navigation";

export default async function SharePage({
  params,
}: {
  params: Promise<{ redeemCode: string }>;
}) {
  const redeemCode = (await params).redeemCode;
  const session = await auth();
  const share = await db.query.deviceShares.findFirst({
    where: (t, { eq }) => eq(t.redeemCode, redeemCode),
    with: {
      device: true,
    },
  });

  if (!share) {
    notFound();
  }

  const isOwner = share.device.userId === session?.user?.id;
  const isAlreadyRedeemed = !!share.userId;
  return (
    <div>
      <PageHeader>
        <div className="flex flex-col justify-center">
          <div className="flex flex-row gap-4">
            <DeviceHeader device={share.device} disabled />
          </div>
        </div>
      </PageHeader>
      <div className="p-4">
        {isAlreadyRedeemed ? (
          <div>{`This share link has already been used`}</div>
        ) : isOwner ? (
          <div>{`Share this link to invite another person to this device`}</div>
        ) : (
          <div>
            <form
              action={async () => {
                "use server";
                await joinDevice({ redeemCode });
                // After joining the device, navigate to the device page
                // Since we're in a server action, we need to redirect using next/navigation
                // (imported as notFound above, but can use redirect directly)
                redirect(`/shortwave/${share.device.deviceId}`);
              }}
            >
              <PillButton type="submit" label="Join" />
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
