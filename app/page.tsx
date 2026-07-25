import { redirect } from "next/navigation";

// "/" has no content of its own — proxy.ts already sends anyone unauthenticated
// to /login, so an authenticated visit here just forwards straight to the
// dashboard instead of showing a static home screen.
export default function Home() {
  redirect("/dashboard");
}
