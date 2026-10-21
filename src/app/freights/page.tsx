import { TRANSPORT_ENABLED } from "@/lib/transport-module";
import { notFound, redirect } from "next/navigation";

export default function FreightsPage() {
  if (!TRANSPORT_ENABLED) notFound();
  redirect("/transport?tab=freights");
}
