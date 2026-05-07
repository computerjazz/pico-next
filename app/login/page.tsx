import { SignInButton } from "../components/SignInButton";

export default async function LoginPage() {
  return (
    <div className="mx-auto max-w-xl p-6 space-y-8">
      <h1 className="text-2xl font-bold">Login</h1>
      <SignInButton />
    </div>
  );
}
