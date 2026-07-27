import { headers } from "next/headers";
import GetStartedPage from "./get-started-client";

export default async function Page() {
  const headersList = await headers();
  const vercelCountry = headersList.get("x-vercel-ip-country") || "";
  const vercelTimeZone = headersList.get("x-vercel-ip-timezone") || "";
  return (
    <GetStartedPage
      initialCountryCode={vercelCountry}
      initialTimeZone={vercelTimeZone}
    />
  );
}
