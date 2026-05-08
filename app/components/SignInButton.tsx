import { signIn } from "@/auth";

export function SignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google");
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center px-3 py-1 rounded-full bg-gray-800 text-gray-400 text-sm font-medium hover:bg-blue-200 transition cursor-pointer border-2"
      >
        Sign in with Google
      </button>
    </form>
  );
}
