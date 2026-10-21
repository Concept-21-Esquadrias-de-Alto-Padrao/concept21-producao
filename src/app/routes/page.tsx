import { TRANSPORT_ENABLED } from "@/lib/transport-module";
import { notFound, redirect } from "next/navigation";

export default function RoutesPage() {
  if (!TRANSPORT_ENABLED) notFound();
  redirect("/transport?tab=routes");
}
