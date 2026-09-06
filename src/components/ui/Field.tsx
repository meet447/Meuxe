import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";
import { ChevronDownIcon } from "./icons";

/* Shared control skin: sunken warm well that lifts to a raised surface on focus. */
export const controlClass =
  "w-full rounded-field bg-well/70 px-4 py-3 text-[15px] text-ink placeholder:text-ink-4 shadow-inset outline-none transition-all duration-150 hover:bg-well focus:bg-surface-2 focus:shadow-none focus:ring-3 focus:ring-accent-200 disabled:opacity-50";

export function Label({
  children,
  hint,
  optional,
  className,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement> & { hint?: ReactNode; optional?: boolean }) {
  return (
    <label className={cn("mb-1.5 block text-[13px] font-semibold text-ink-2", className)} {...rest}>
      {children}
      {optional && <span className="ml-1 font-normal text-ink-4">optional</span>}
      {hint && <span className="ml-2 font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, "resize-none leading-relaxed", className)} {...rest} />;
}

export function Select({
  className,
  wrapperClassName,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select className={cn(controlClass, "cursor-pointer appearance-none pr-10", className)} {...rest}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-1.5 text-xs leading-relaxed text-ink-3", className)}>{children}</p>;
}

export function FieldError({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={cn("mt-1.5 text-xs font-medium text-clay-700", className)}>{children}</p>;
}

/** Vertical spacing wrapper: label → control → hint/error. */
export function Field({
  label,
  hint,
  error,
  optional,
  id,
  htmlFor,
  className,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  id?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  const autoId = useId();
  const controlId = htmlFor ?? id ?? autoId;
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<{ id?: string }>, {
        id: (children.props as { id?: string }).id ?? controlId,
      })
    : children;

  return (
    <div className={cn("mb-4 last:mb-0", className)}>
      {label && (
        <Label htmlFor={controlId} optional={optional}>
          {label}
        </Label>
      )}
      {control}
      {error ? <FieldError>{error}</FieldError> : hint ? <Hint>{hint}</Hint> : null}
    </div>
  );
}
