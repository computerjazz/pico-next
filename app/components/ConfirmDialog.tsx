// components/confirm-dialog.tsx
"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState, useCallback } from "react";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  options?: { text: string; type: string }[];
};

type ConfirmState = ConfirmOptions & {
  open: boolean;
  resolve?: (value: boolean | string) => void;
};

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    title: "",
  });

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean | string>((resolve) => {
      setState({ ...options, open: true, resolve });
    });
  }, []);

  const handleConfirm = () => {
    state.resolve?.("confirm");
    setState((s) => ({ ...s, open: false }));
  };

  const handleCancel = () => {
    state.resolve?.(false);
    setState((s) => ({ ...s, open: false }));
  };

  const handleOption = (type: string) => {
    state.resolve?.(type);
    setState((s) => ({ ...s, open: false }));
  };

  const ConfirmDialog = (
    <AlertDialog.Root
      open={state.open}
      onOpenChange={(open) => !open && handleCancel()}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface rounded-lg p-6 w-full max-w-sm shadow-lg z-50">
          {state.title && (
            <AlertDialog.Title className="text-lg font-semibold">
              {state.title}
            </AlertDialog.Title>
          )}
          {state.description && (
            <AlertDialog.Description className="text-sm text-foreground mt-2">
              {state.description}
            </AlertDialog.Description>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <AlertDialog.Cancel asChild>
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-md text-sm font-medium border cursor-pointer"
              >
                {state.cancelText ?? "Cancel"}
              </button>
            </AlertDialog.Cancel>
            {state.options?.map((option) => {
              return (
                <AlertDialog.Action
                  asChild
                  key={`option-${option.text}-${option.type}`}
                >
                  <button
                    onClick={() => handleOption(option.type)}
                    className={`px-4 py-2 rounded-md text-sm font-medium border cursor-pointer`}
                  >
                    {option.text}
                  </button>
                </AlertDialog.Action>
              );
            })}
            <AlertDialog.Action asChild>
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 rounded-md text-sm font-medium text-accent-foreground cursor-pointer ${
                  state.destructive ? "bg-accent" : "bg-muted-surface"
                }`}
              >
                {state.confirmText ?? "Confirm"}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );

  return { confirm, ConfirmDialog };
}
