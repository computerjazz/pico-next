import Link from "next/link";
import ProfileSignInButton from "./ProfileSignInButton";
import Image from "next/image";

function PageHeader({
  children,
  title,
}: {
  children?: React.ReactNode;
  title?: string | null;
}) {
  return (
    <div className="p-4 flex flex-row justify-between gap-4 sticky top-0 z-50 bg-background">
      <div className="flex flex-row gap-4">
        <Link href="/">
          <Image
            width={30}
            height={30}
            src="/img/icons/icon-192.png"
            alt="Shortwave Logo"
            className="rounded-full aspect-1 aspect-square min-w-6"
          />
        </Link>
        {!!title && <h1 className="text-3xl font-bold text-accent">{title}</h1>}
        {children}
      </div>
      <div className="flex justify-end items-top">
        <ProfileSignInButton />
      </div>
    </div>
  );
}

export default PageHeader;
