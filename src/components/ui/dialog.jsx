// src/components/ui/dialog.jsx
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

// Exports base (mismo API que shadcn)
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef(function DialogOverlay(
  { className = '', ...props },
  ref
) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm ${className}`}
      {...props}
    />
  );
});

export const DialogContent = React.forwardRef(function DialogContent(
  { className = '', children, ...props },
  ref
) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={`fixed z-50 grid w-full max-w-lg gap-4 border border-slate-700 bg-slate-900 p-6 text-slate-200 shadow-xl rounded-xl 
        left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${className}`}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 rounded-md opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-slate-400" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({ className = '', ...props }) {
  return (
    <div className={`flex flex-col space-y-1.5 text-center sm:text-left ${className}`} {...props} />
  );
}

export function DialogFooter({ className = '', ...props }) {
  return (
    <div
      className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 ${className}`}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef(function DialogTitle(
  { className = '', ...props },
  ref
) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={`text-lg font-semibold leading-none tracking-tight text-white ${className}`}
      {...props}
    />
  );
});

export const DialogDescription = React.forwardRef(function DialogDescription(
  { className = '', ...props },
  ref
) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={`text-sm text-slate-400 ${className}`}
      {...props}
    />
  );
});
