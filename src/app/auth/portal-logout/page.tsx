import { headers } from "next/headers";
import { PortalLogoutProgress } from "@/components/portal-logout-progress";
import { secureOrigin,trustedReferrer } from "@/lib/portal-session-policy";
export const dynamic="force-dynamic";
export default async function Logout(){
 const portal=secureOrigin(process.env.NEXT_PUBLIC_PORTAL_ORIGIN);if(!portal)return <main>A saída pelo Portal não está configurada.</main>;
 return <PortalLogoutProgress autoStart={trustedReferrer((await headers()).get("referer"),[portal])} nextUrl={portal+"/auth/logout?step=commercial"} restartUrl={portal+"/auth/logout"}/>;
}
