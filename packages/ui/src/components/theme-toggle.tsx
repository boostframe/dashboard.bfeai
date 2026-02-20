"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

import { cn } from "../lib/utils";

export interface ThemeToggleProps {
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: "sm" | "default" | "lg";
  /** Callback when theme changes */
  onThemeChange?: (theme: string) => void;
  /** Whether to sync theme to cookie on .bfeai.com domain */
  syncToCookie?: boolean;
  /** Compact mode - single button that cycles through themes */
  compact?: boolean;
}

const sizeClasses = {
  sm: {
    container: "h-7 p-0.5 gap-0.5",
    button: "h-6 w-6",
    icon: "h-3.5 w-3.5",
  },
  default: {
    container: "h-8 p-0.5 gap-0.5",
    button: "h-7 w-7",
    icon: "h-4 w-4",
  },
  lg: {
    container: "h-9 p-1 gap-1",
    button: "h-7 w-7",
    icon: "h-4 w-4",
  },
};

const themeOrder = ["light", "dark"] as const;
const themeIcons = { light: Sun, dark: Moon };
const themeLabels = {
  light: "Light mode",
  dark: "Dark mode",
};

/**
 * Theme toggle segmented control for BFEAI apps.
 * Displays two options: Light and Dark with outline icons.
 * In compact mode, shows single icon that toggles between themes on click.
 */
export function ThemeToggle({
  className,
  size = "default",
  onThemeChange,
  syncToCookie = false,
  compact = false,
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Prevent hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeChange = React.useCallback(
    (newTheme: string) => {
      setTheme(newTheme);

      // Sync to cookie on .bfeai.com domain for cross-app persistence
      if (syncToCookie && typeof document !== "undefined") {
        const isProduction = window.location.hostname.endsWith(".bfeai.com");
        const domain = isProduction ? ".bfeai.com" : "";
        const domainAttr = domain ? `; domain=${domain}` : "";
        document.cookie = `bfeai_theme=${newTheme}; path=/${domainAttr}; max-age=31536000; SameSite=Lax`;
      }

      onThemeChange?.(newTheme);
    },
    [setTheme, syncToCookie, onThemeChange]
  );

  // Cycle to next theme (for compact mode)
  const cycleTheme = React.useCallback(() => {
    const currentIndex = themeOrder.indexOf(
      theme as (typeof themeOrder)[number]
    );
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    handleThemeChange(themeOrder[nextIndex]);
  }, [theme, handleThemeChange]);

  const sizes = sizeClasses[size];

  const options = [
    { value: "light", icon: Sun, label: "Light mode" },
    { value: "dark", icon: Moon, label: "Dark mode" },
  ] as const;

  // Show placeholder during SSR to prevent hydration mismatch
  if (!mounted) {
    if (compact) {
      return (
        <div
          className={cn(
            "flex items-center justify-center rounded-full border bg-muted",
            sizes.button,
            className
          )}
          aria-hidden="true"
        >
          <Sun
            className={cn(sizes.icon, "text-muted-foreground")}
            strokeWidth={1.5}
          />
        </div>
      );
    }
    return (
      <div
        className={cn(
          "inline-flex items-center rounded-full border bg-muted",
          sizes.container,
          className
        )}
        aria-hidden="true"
      >
        {options.map((option) => (
          <div
            key={option.value}
            className={cn(
              "flex items-center justify-center rounded-full",
              sizes.button
            )}
          >
            <option.icon
              className={cn(sizes.icon, "text-muted-foreground")}
              strokeWidth={1.5}
            />
          </div>
        ))}
      </div>
    );
  }

  // Compact mode - single button that cycles through themes
  if (compact) {
    const currentTheme = (theme as (typeof themeOrder)[number]) || "light";
    const Icon = themeIcons[currentTheme] || Sun;
    const label = themeLabels[currentTheme] || "Light mode";

    return (
      <button
        type="button"
        aria-label={`Current: ${label}. Click to change theme.`}
        title={`${label} - Click to cycle`}
        onClick={cycleTheme}
        className={cn(
          "flex items-center justify-center rounded-full border bg-muted transition-colors",
          "hover:bg-background hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          sizes.button,
          "text-muted-foreground",
          className
        )}
      >
        <Icon className={sizes.icon} strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme selection"
      className={cn(
        "inline-flex items-center rounded-full border bg-muted",
        sizes.container,
        className
      )}
    >
      {options.map((option) => {
        const isActive = theme === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={option.label}
            onClick={() => handleThemeChange(option.value)}
            className={cn(
              "flex items-center justify-center rounded-full transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              sizes.button,
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className={sizes.icon} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}
