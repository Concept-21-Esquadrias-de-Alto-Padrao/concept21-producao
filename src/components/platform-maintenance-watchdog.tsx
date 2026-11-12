"use client";
import { useEffect,useState } from "react";
export function PlatformMaintenanceWatchdog(){
 const [adminMessage,setAdminMessage]=useState("");
 useEffect(()=>{
  let active=true,busy=false;
  async function check(){
   if(busy||document.visibilityState==="hidden")return;busy=true;
   try{
    const response=await fetch("/api/platform-maintenance/status",{cache:"no-store"});
    if(!response.ok)return;
    const status=await response.json();if(!active)return;
    if(status.enabled&&!status.canAccess){window.location.replace("https://concept21-portal.vercel.app/manutencao?modulo=production");return;}
    setAdminMessage(status.enabled&&status.admin?"Manutenção ativa. Você mantém o acesso administrativo para validação.":"");
   }catch{/* Each operation remains protected by the server and database. */}finally{busy=false;}
  }
  void check();const timer=window.setInterval(()=>void check(),5000);
  const visible=()=>void check();document.addEventListener("visibilitychange",visible);
  return()=>{active=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
 },[]);
 return adminMessage?<aside role="status" style={{position:"fixed",bottom:16,right:16,zIndex:9999,maxWidth:420,padding:16,border:"1px solid #fdba74",borderRadius:12,background:"#fff7ed",color:"#9a3412",fontSize:14,boxShadow:"0 4px 16px #0001"}}>{adminMessage} <a href="https://concept21-portal.vercel.app/manutencao/controle" style={{textDecoration:"underline"}}>Controle no Portal</a></aside>:null;
}
