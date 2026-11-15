export const PORTAL_PROVIDER = "custom:concept21-portal";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function portalSubject(identities:ReadonlyArray<{provider?:string;id?:string|null}>|null|undefined):string|null{
 const ids=new Set((identities??[]).filter(i=>i.provider===PORTAL_PROVIDER).map(i=>i.id).filter((id):id is string=>typeof id==="string"&&uuid.test(id)));
 return ids.size===1?[...ids][0]:null;
}
export function bindingAllows(userId:string,subject:string|null,binding:{auth_user_id:string;portal_auth_user_id:string;allowed:boolean}|null){
 return Boolean(subject&&binding?.allowed&&binding.auth_user_id===userId&&binding.portal_auth_user_id===subject);
}
export const portalTransitions=new Set(["/auth/portal-entry","/auth/complete","/auth/portal-logout"]);
export function isLocalAuthPath(path:string){return path==="/login"||path==="/cadastro"||path==="/auth"||(path.startsWith("/auth/")&&!portalTransitions.has(path));}

export type AdminAssignment={user_id:string;profile_id:string;active:boolean;starts_at:string|null;ends_at:string|null};
export type AdminProfile={id:string;active:boolean;is_system_admin:boolean};
export function hasCurrentSystemAdminProfile(userId:string,userActive:boolean,assignments:AdminAssignment[],profiles:AdminProfile[],now:number){
 if(!userActive||!Number.isFinite(now))return false;
 return assignments.some(a=>a.user_id===userId&&a.active&&
  (a.starts_at===null||Date.parse(a.starts_at)<=now)&&(a.ends_at===null||Date.parse(a.ends_at)>=now)&&
  profiles.some(p=>p.id===a.profile_id&&p.active&&p.is_system_admin));
}
