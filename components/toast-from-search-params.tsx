"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

interface ToastFromSearchParamsProps {
  error?: string;
  message?: string;
}

// Server actions on this app report success/failure by redirecting to
// `?error=`/`?message=` (see e.g. features/settings, features/auth/profile).
// This fires the matching toast once, then strips just those two keys from
// the URL — other params (like invite/accept's `?token=`) are preserved —
// so refreshing or hitting back doesn't re-show a stale banner.
export function ToastFromSearchParams({ error, message }: ToastFromSearchParamsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!error && !message) return;
    if (error) toast.error(error);
    if (message) toast.success(message);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("error");
    params.delete("message");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // Only re-run when the redirect result itself changes, not on every
    // searchParams/router identity change (which would loop the replace).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, message]);

  return null;
}
