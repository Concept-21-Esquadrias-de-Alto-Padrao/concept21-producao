import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({configured:true,authenticate:vi.fn(),rpc:vi.fn(),user:vi.fn(),invalidate:vi.fn()}));
vi.mock("@/lib/server-access",()=>({requireAuthenticatedProfile:mocks.authenticate}));
vi.mock("@/lib/supabase/server",()=>({hasSupabaseEnv:()=>mocks.configured}));
vi.mock("next/cache",()=>({revalidatePath:mocks.invalidate}));
import { lifecycleAction } from "./lifecycle-actions";
const entity="00000000-0000-4000-8000-000000000001";
function form(){ const f=new FormData();f.set("entity",entity);f.set("command","confirm_scope");f.set("reason","Evidência técnica");f.set("confirmed","yes");return f; }
beforeEach(()=>{vi.clearAllMocks();mocks.configured=true;mocks.authenticate.mockResolvedValue({authUserId:"actual-auth-user",profile:{id:"actual-profile"},admin:{rpc:mocks.rpc,auth:{admin:{getUserById:mocks.user}}}});mocks.user.mockResolvedValue({data:{user:{email_confirmed_at:"2026-01-01"}},error:null});mocks.rpc.mockResolvedValue({data:{ok:true,contract_id:entity},error:null});});
describe("lifecycle server boundary",()=>{
 it("rejects forged or unconfirmed commands before database access",async()=>{
  const f=form();f.delete("confirmed");expect((await lifecycleAction({ok:false,message:""},f)).ok).toBe(false);expect(mocks.authenticate).not.toHaveBeenCalled();
 });
 it("takes the actor from the authenticated session, never posted fields",async()=>{
  const f=form();f.set("p_actor","attacker");f.set("company_id","other");expect((await lifecycleAction({ok:false,message:""},f)).ok).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith("production_lifecycle_command",expect.objectContaining({p_actor:"actual-profile",p_entity:entity}));
 });
 it("does not mutate on an expired session",async()=>{
  mocks.authenticate.mockRejectedValue(new Error("Sessão não encontrada"));expect((await lifecycleAction({ok:false,message:""},form())).ok).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("refuses users without confirmed email",async()=>{
  mocks.user.mockResolvedValue({data:{user:{}},error:null});expect((await lifecycleAction({ok:false,message:""},form())).ok).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("surfaces a transaction rejection without reporting success",async()=>{
  mocks.rpc.mockResolvedValue({error:{message:"Há PRODs pendentes"}});expect(await lifecycleAction({ok:false,message:""},form())).toEqual({ok:false,message:"Há PRODs pendentes"});expect(mocks.invalidate).not.toHaveBeenCalled();
 });
 it("demo submission never reaches database",async()=>{
  mocks.configured=false;expect((await lifecycleAction({ok:false,message:""},form())).ok).toBe(false);expect(mocks.authenticate).not.toHaveBeenCalled();
 });
});
