"use server";

import { redirect } from "next/navigation";
import { loginWithPassword, logout } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const user = await loginWithPassword(email, password);
  if (!user) {
    redirect("/login?error=1");
  }
  redirect("/calendario");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
