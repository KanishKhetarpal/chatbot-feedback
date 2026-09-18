"use client";

import React, { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ResponsiveTooltipPopoverProps {
  trigger: React.ReactNode;
  content: React.ReactNode;
  className?: string; // additional classes for content
  stopPropagation?: boolean; // stop click bubbling on trigger
}

/**
 * ResponsiveTooltipPopover
 * - Desktop: renders Tooltip
 * - Mobile: renders Popover (click to open)
 */
export function ResponsiveTooltipPopover({
  trigger,
  content,
  className,
  stopPropagation = true,
}: ResponsiveTooltipPopoverProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <span onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}>{trigger}</span>
        </PopoverTrigger>
        <PopoverContent showArrow side="top" align="center" className={cn("w-fit", className)}>
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}>{trigger}</span>
      </TooltipTrigger>
      <TooltipContent className={className}>{content}</TooltipContent>
    </Tooltip>
  );
}
