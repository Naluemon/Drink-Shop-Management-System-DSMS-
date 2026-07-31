"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExportMenuButtonProps {
  onExport: (format: "xlsx" | "csv") => void;
  disabled?: boolean;
}

// One "ส่งออก" button covering both file formats, instead of two separate
// buttons per page — used anywhere a list can be exported as Excel or CSV.
export function ExportMenuButton({ onExport, disabled }: ExportMenuButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" disabled={disabled} />}>
        <Download /> ส่งออก
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onExport("xlsx")}>เป็นไฟล์ Excel</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("csv")}>เป็นไฟล์ CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
