"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

// IMPLEMENTATION_PLAN.md Phase 12 "Theme" task. `mounted` guard is the
// documented next-themes pattern (not a data-fetch-in-effect anti-pattern) —
// resolving the actual theme requires reading localStorage/matchMedia, which
// only exists client-side, so the server-rendered pass must show nothing
// until hydration completes to avoid a light/dark flash mismatch.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Official next-themes hydration-safety pattern — resolving the actual
    // theme needs localStorage/matchMedia (client-only), so this is genuinely
    // "synchronizing with an external system", not a data-fetch-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-[104px]" />;
  }

  // Icon-only: this lives in the sidebar's user menu now (available to every
  // role, not just Owner — a browser-local preference has no business being
  // gated behind Settings' Owner-only page), where a tight dropdown has no
  // room for the old three-button-with-labels layout.
  return (
    <div className="flex gap-1.5">
      <Button
        type="button"
        size="icon"
        variant={theme === "light" ? "default" : "outline"}
        onClick={() => setTheme("light")}
        aria-label="ธีมสว่าง"
        title="สว่าง"
      >
        <Sun />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={theme === "dark" ? "default" : "outline"}
        onClick={() => setTheme("dark")}
        aria-label="ธีมมืด"
        title="มืด"
      >
        <Moon />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={theme === "system" ? "default" : "outline"}
        onClick={() => setTheme("system")}
        aria-label="ธีมตามระบบ"
        title="ตามระบบ"
      >
        <Monitor />
      </Button>
    </div>
  );
}
