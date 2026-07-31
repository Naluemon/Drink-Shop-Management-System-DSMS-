import Swal from "sweetalert2";

// Drop-in replacement for sonner's toast API (same `toast.success/error/
// warning(message)` call shape everywhere in the app) but rendered as a
// centered SweetAlert2 popup instead of a corner toast — bigger icon,
// animation, requires an explicit "ตกลง" click to dismiss, per user request.
const BASE_OPTIONS = {
  confirmButtonText: "ตกลง",
  confirmButtonColor: "var(--primary)",
  heightAuto: false,
} as const;

// Accepts `string | undefined` (not just `string`) because a few call sites
// pass an already-optional `result.error` straight through — sonner's toast()
// tolerated that loosely too; silently no-op rather than show an empty popup.
//
// Success auto-dismisses after 1.5s with no confirm button — it's a "this
// worked" notice, not something that needs acknowledgment, so it shouldn't
// block the user's next click. Error/warning stay manual-dismiss: they carry
// information (what went wrong) the user needs a beat to actually read.
function success(message: string | undefined) {
  if (!message) return;
  void Swal.fire({
    ...BASE_OPTIONS,
    icon: "success",
    title: message,
    timer: 1500,
    timerProgressBar: true,
    showConfirmButton: false,
  });
}

function error(message: string | undefined) {
  if (!message) return;
  void Swal.fire({ ...BASE_OPTIONS, icon: "error", title: message });
}

function warning(message: string | undefined) {
  if (!message) return;
  void Swal.fire({ ...BASE_OPTIONS, icon: "warning", title: message });
}

export const toast = { success, error, warning };

// Same SweetAlert2 look as the toasts above, but for the "are you sure you
// want to delete this?" moment — must block on an explicit choice, so no
// timer/auto-dismiss here, and it resolves to whether the user confirmed.
export async function confirmDelete(options: {
  title: string;
  description: string;
  confirmLabel?: string;
}): Promise<boolean> {
  const result = await Swal.fire({
    icon: "warning",
    // titleText (not title) — title is parsed as HTML by SweetAlert2, and
    // this string embeds a user-controlled name (ingredient/menu/recipe/
    // supplier), so a name like `<img src=x onerror=...>` would execute as
    // live JS for whoever next opens this dialog (stored XSS).
    titleText: options.title,
    text: options.description,
    showCancelButton: true,
    confirmButtonText: options.confirmLabel ?? "ลบ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "var(--destructive)",
    cancelButtonColor: "var(--muted-foreground)",
    reverseButtons: true,
    heightAuto: false,
  });
  return result.isConfirmed;
}
