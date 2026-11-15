"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
export function PortalSessionWatchdog(){
 const path=usePathname();
 useEffect(()=>{
  if(path.startsWith("/auth/")||path.startsWith("/api/"))return;
  let active=true,pending=false;const portal=process.env.NEXT_PUBLIC_PORTAL_ORIGIN;
  if(!portal)return;
  const back=()=>window.location.replace(portal+"/");
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)return;const auth=createBrowserClient(url,key);const {data:{subscription}}=auth.auth.onAuthStateChange(event=>{if(active&&event==="SIGNED_OUT")back();});
  const check=async()=>{if(pending||document.visibilityState==="hidden")return;pending=true;
   try{const r=await fetch("/api/platform-session/status",{cache:"no-store"});const s=await r.json();if(active&&!s.allowed)back();}catch{/* The server checks every operation independently. */}finally{pending=false;}};
  const timer=window.setInterval(()=>void check(),10000);window.addEventListener("focus",check);
  return()=>{active=false;subscription.unsubscribe();window.clearInterval(timer);window.removeEventListener("focus",check);};
 },[path]);return null;
}
