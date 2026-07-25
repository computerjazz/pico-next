import Link from "next/link";
import ProfileSignInButton from "./ProfileSignInButton";
import Image from "next/image";
import PageHeaderMenu from "./PageHeaderMenu";
import PageHeaderBackground from "./PageHeaderBackground";
function PageHeader({
  children,
  title,
}: {
  children?: React.ReactNode;
  title?: string | null;
}) {
  return (
    <PageHeaderBackground>
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
        {children || <PageHeaderMenu title={title} />}
      </div>
      <div className="flex justify-end items-top">
        <ProfileSignInButton />
      </div>
    </PageHeaderBackground>
  );
}

export default PageHeader;
