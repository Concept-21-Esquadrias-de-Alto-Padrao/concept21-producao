import { TRANSPORT_ENABLED } from "@/lib/transport-module";
import { notFound, redirect } from "next/navigation";

export default function ExtraServicesPage() {
  if (!TRANSPORT_ENABLED) notFound();
  redirect("/transport?tab=extra-services");
}
