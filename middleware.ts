import { createMiddlewareClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createMiddlewareClient({ req: request, res: response });
  const { data: { user } } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname === "/login";

  if (!user && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && isLogin) {
    return NextResponse.redirect(new URL("/sales", request.url));
  }

  if (user) {
    const { data: staff } = await supabase
      .from("staff")
      .select("role")
      .eq("id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    const headers = new Headers(request.headers);
    if (staff?.role) headers.set("x-staff-role", staff.role);
    response = NextResponse.next({ request: { headers } });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
