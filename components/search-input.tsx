import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  containerClassName?: string;
}

// A plain <Input> reads as a generic text box — this adds the leading
// magnifying-glass icon so a search field is recognizable as one at a
// glance, used on every list page's toolbar (ingredients, recipes, menus, ...).
export function SearchInput({ className, containerClassName, ...props }: SearchInputProps) {
  return (
    // A fixed compact width (not w-full) so this sits comfortably next to a
    // filter Select in the same row instead of claiming all available space
    // and pushing the filter onto its own line.
    <div className={cn("relative w-full max-w-56 shrink-0", containerClassName)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input type="text" className={cn("pl-8", className)} {...props} />
    </div>
  );
}
