import { redirect } from "next/navigation";

export default function FreightsPage() {
  redirect("/transport?tab=freights");
}
