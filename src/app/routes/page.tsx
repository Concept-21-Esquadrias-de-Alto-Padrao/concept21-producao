import { redirect } from "next/navigation";

export default function RoutesPage() {
  redirect("/transport?tab=routes");
}
