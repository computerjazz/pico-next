import Link from "next/link";
import ProfileSignInButton from "./ProfileSignInButton";
import Image from "next/image";

function PageHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 flex flex-row justify-between gap-4">
      <div className="flex flex-row gap-4">
        <Link href="/">
          <Image
            width={48}
            height={48}
            src="/img/icons/icon-192.png"
            alt="Shortwave Logo"
            className="rounded-full aspect-1"
          />
        </Link>
        {children}
      </div>
      <div className="flex justify-end items-top">
        <ProfileSignInButton />
      </div>
    </div>
  );
}

export default PageHeader;
