import { redirect } from "next/navigation";

export default function ExtraServicesPage() {
  redirect("/transport?tab=extra-services");
}
