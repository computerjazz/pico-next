import { auth } from "@/auth";
import { db } from "@/db";
import ProfileButton from "./ProfileButton";
import { SignInButton } from "./SignInButton";

async function ProfileSignInButton() {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  const devices = sessionUserId
    ? await db.query.devices.findMany({
        where: (t, { eq }) => eq(t.userId, sessionUserId),
      })
    : [];
  return session ? (
    <ProfileButton session={session} devices={devices} />
  ) : (
    <SignInButton />
  );
}

export default ProfileSignInButton;
