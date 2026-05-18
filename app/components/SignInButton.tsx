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
        className="inline-flex items-center px-3 py-1 rounded-full text-accent text-sm font-medium hover:bg-accent hover:text-accent-foreground transition cursor-pointer border-2"
      >
        Sign in with Google
      </button>
    </form>
  );
}
