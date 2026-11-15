import { NextResponse } from "next/server";
export async function POST(){return NextResponse.json({allowed:false},{status:410,headers:{"Cache-Control":"no-store"}});}
