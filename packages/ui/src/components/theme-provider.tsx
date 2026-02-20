"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Default theme if no preference is stored. Defaults to "light" */
  defaultTheme?: "light" | "dark";
  /** localStorage key for storing theme preference. Defaults to "theme" */
  storageKey?: string;
  /** Disable CSS transitions when switching themes to prevent flash. Defaults to true */
  disableTransitionOnChange?: boolean;
}

/**
 * Theme provider for BFEAI apps. Wraps next-themes with ecosystem defaults.
 *
 * Usage:
 * ```tsx
 * // In your root layout.tsx
 * import { ThemeProvider } from "@bfeai/ui";
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html lang="en" suppressHydrationWarning>
 *       <body>
 *         <ThemeProvider>{children}</ThemeProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem={false}
      storageKey={storageKey}
      disableTransitionOnChange={disableTransitionOnChange}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
