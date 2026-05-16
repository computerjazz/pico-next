import { auth } from "@/auth";
import { db } from "@/db";
import ProfileButton from "./ProfileButton";
import { SignInButton } from "./SignInButton";
import { cookies } from "next/headers";

async function ProfileSignInButton() {
  const session = await auth();
  const theme = (await cookies()).get("theme")?.value ?? "light";

  const sessionUserId = session?.user?.id;
  const devices = sessionUserId
    ? await db.query.devices.findMany({
        where: (t, { eq }) => eq(t.userId, sessionUserId),
      })
    : [];
  return session ? (
    <ProfileButton session={session} devices={devices} theme={theme} />
  ) : (
    <SignInButton />
  );
}

export default ProfileSignInButton;
