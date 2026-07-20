import { redirect } from "next/navigation";

/**
 * Root entry. In M0 this simply routes into the app shell. Once auth middleware
 * lands, unauthenticated users will be redirected to /login (docs/13 §A1).
 */
export default function Home() {
  redirect("/dashboard");
}
