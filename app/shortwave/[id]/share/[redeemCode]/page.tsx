import { auth } from "@/auth";
import { db } from "@/db";
import { notFound } from "next/navigation";

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

  if (share.device.userId === session?.user?.id) {
    return (
      <div>{`Share this link to invite another person to this device`}</div>
    );
  } else {
    return <div>Redeem this device</div>;
  }
}
