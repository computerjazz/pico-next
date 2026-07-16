import ClaimButton from "@/app/components/ClaimButton";
import { SignInButton } from "@/app/components/SignInButton";
import { Device } from "@/db/schema";

function Welcome({
  isLoggedIn,
  device,
}: {
  isLoggedIn: boolean;
  device: Device;
}) {
  return (
    <div className="flex flex-col p-4 justify-center items-center w-full gap-4">
      <h1 className="font-bold text-3xl text-center w-full">
        Welcome to your new sh0rtwave!
      </h1>
      <div className="gap-4 flex flex-col">
        {isLoggedIn ? (
          <>
            <div>
              Claim this device to start recording and listening to your
              messages
            </div>
            <div className="items-center flex flex-col">
              <ClaimButton device={device} />
            </div>
          </>
        ) : (
          <div className="flex flex-row items-center gap-2">
            <SignInButton /> <span>to get started</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default Welcome;
