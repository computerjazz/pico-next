import { signIn } from "@/auth";
import Google from "./icons/Google";

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
        className="whitespace-nowrap inline-flex items-center px-3 py-1 rounded-full text-accent text-sm font-medium hover:bg-accent hover:text-accent-foreground transition cursor-pointer border-2 gap-2 items-center"
      >
        <Google className="size-4" />
        <span>Sign in</span>
      </button>
    </form>
  );
}
