"use client";

import * as React from "react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface PopconfirmProps {
  children: React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popconfirm({
  children,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  onCancel,
  open,
  onOpenChange,
}: PopconfirmProps) {
  const [innerOpen, setInnerOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const isControlled = open !== undefined;
  const actualOpen = isControlled ? open : innerOpen;

  const setOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setInnerOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const handleCancel = () => {
    onCancel?.();
    setOpen(false);
  };

  const handleConfirm = async () => {
    if (loading) return;

    try {
      setLoading(true);
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={actualOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-72 space-y-3 p-3"
        onClick={(e) => e.stopPropagation()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleCancel}
          >
            {cancelText}
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleConfirm}
            disabled={loading}
          >
            {confirmText}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
