import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";
import { forwardRef, useId } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => {
    const generatedId = useId();
    const inputId = props.id ?? generatedId;
    const errorId = `${inputId}-error`;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700">{label}</label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "rounded-lg border border-gray-300 px-4 py-2.5 text-base transition-colors",
            "placeholder:text-gray-400",
            "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
            error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
            className
          )}
          {...props}
        />
        {error && <p id={errorId} role="alert" className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
