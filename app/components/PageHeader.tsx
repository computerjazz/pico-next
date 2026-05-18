import ProfileSignInButton from "./ProfileSignInButton";

function PageHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 flex flex-row justify-between gap-4">
      {children}
      <div className="flex justify-end items-top">
        <ProfileSignInButton />
      </div>
    </div>
  );
}

export default PageHeader;
