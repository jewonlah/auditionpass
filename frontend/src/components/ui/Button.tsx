import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "accent" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" &&
          "bg-primary text-white hover:bg-primary-hover focus:ring-primary",
        variant === "accent" &&
          "bg-accent text-white hover:bg-accent-hover focus:ring-accent",
        variant === "outline" &&
          "border-2 border-primary text-primary hover:bg-primary hover:text-white focus:ring-primary",
        variant === "ghost" &&
          "text-gray-600 hover:bg-gray-100 focus:ring-gray-300",
        size === "sm" && "px-3 py-1.5 text-sm",
        size === "md" && "px-4 py-2.5 text-base",
        size === "lg" && "px-6 py-3 text-lg",
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
