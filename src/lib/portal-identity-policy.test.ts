import { describe,it,expect } from "vitest";
import { portalSubject,bindingAllows,isLocalAuthPath } from "./portal-identity-policy";
import { parsePlatformInstall } from "./platform-install-policy";
import { secureOrigin,trustedReferrer,endBrowserSession } from "./portal-session-policy";
const u="00000000-0000-4000-8000-000000000001",p="00000000-0000-4000-8000-000000000002",l="00000000-0000-4000-8000-000000000003";
describe("Portal authority boundaries",()=>{
 it("requires the exact provider and an unambiguous subject",()=>{
  expect(portalSubject([{provider:"email",id:p}])).toBeNull();
  expect(portalSubject([{provider:"custom:concept21-portal",id:p}])).toBe(p);
  expect(portalSubject([{provider:"custom:concept21-portal",id:p},{provider:"custom:concept21-portal",id:l}])).toBeNull();
 });
 it("denies revoked and mismatched bindings",()=>{
  const b={auth_user_id:u,portal_auth_user_id:p,allowed:true};
  expect(bindingAllows(u,p,b)).toBe(true);expect(bindingAllows(u,l,b)).toBe(false);
  expect(bindingAllows(l,p,b)).toBe(false);expect(bindingAllows(u,p,{...b,allowed:false})).toBe(false);
 });
 it("rejects incomplete or duplicate installation mappings",()=>{
  const body={clientId:l,clientSecret:"x".repeat(32),bindings:[{authUserId:u,portalAuthUserId:p,portalLinkId:l}]};
  expect(parsePlatformInstall(body,[u])).not.toBeNull();
  expect(parsePlatformInstall(body,[u,p])).toBeNull();
  expect(parsePlatformInstall({...body,bindings:[...body.bindings,...body.bindings]},[u])).toBeNull();
 });
 it("allows only explicit auth transitions",()=>{
  expect(isLocalAuthPath("/auth/complete")).toBe(false);expect(isLocalAuthPath("/auth/portal-logout")).toBe(false);
  expect(isLocalAuthPath("/auth/callback")).toBe(true);expect(isLocalAuthPath("/cadastro")).toBe(true);
 });
 it("requires an HTTPS origin and trusted referrer",()=>{
  expect(secureOrigin("https://example.com/path")).toBeNull();expect(secureOrigin("http://example.com")).toBeNull();
  expect(trustedReferrer("https://example.com.evil.test/",["https://example.com"])).toBe(false);
 });
 it("ends only the current browser session and propagates failures",async()=>{
  let scope="";await endBrowserSession({signOut:async o=>{scope=o.scope;return {error:null};}});expect(scope).toBe("local");
  await expect(endBrowserSession({signOut:async()=>({error:new Error("offline")})})).rejects.toThrow();
 });
});
