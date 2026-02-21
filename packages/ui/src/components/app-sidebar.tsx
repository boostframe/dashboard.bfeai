"use client";

import * as React from "react";
import {
  ChevronLeft,
  Coins,
  CreditCard,
  FlaskConical,
  Headphones,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "./sidebar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppSidebarUser {
  email: string;
  fullName?: string;
  avatarUrl?: string;
}

export interface AppSidebarCredits {
  total: number;
}

export interface AppSidebarProps {
  currentApp: "dashboard" | "keywords" | "labs";
  /** Current pathname within the app (e.g. "/apps", "/credits"). Used for active-state highlighting on dashboard sub-pages. */
  pathname?: string;
  user: AppSidebarUser | null;
  credits: AppSidebarCredits | null;
  onLogout: () => void;
  isLoggingOut?: boolean;
  themeToggle?: React.ReactNode;
  dashboardUrl?: string;
  keywordsUrl?: string;
  labsUrl?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DASHBOARD_URL = "https://dashboard.bfeai.com";
const DEFAULT_KEYWORDS_URL = "https://keywords.bfeai.com";
const DEFAULT_LABS_URL = "https://labs.bfeai.com";

/**
 * Resolve a link for a given target app + path.
 * When the user is already on the target app we return a local path;
 * otherwise we return the full external URL.
 */
function resolveHref(
  currentApp: AppSidebarProps["currentApp"],
  targetApp: AppSidebarProps["currentApp"],
  baseUrl: string,
  path: string = "/",
): string {
  if (currentApp === targetApp) {
    return path;
  }
  // Strip trailing slash from baseUrl before appending path
  const base = baseUrl.replace(/\/+$/, "");
  return path === "/" ? base : `${base}${path}`;
}

/** Build initials from a full name (up to 2 chars). */
function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CollapseToggle() {
  const { toggleSidebar, state } = useSidebar();

  return (
    <button
      onClick={toggleSidebar}
      className={cn(
        "absolute -right-3 top-6 z-10 hidden h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-transform hover:text-foreground md:flex",
        state === "collapsed" && "rotate-180",
      )}
      aria-label="Toggle Sidebar"
    >
      <ChevronLeft className="h-4 w-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AppSidebar({
  currentApp,
  pathname,
  user,
  credits,
  onLogout,
  isLoggingOut = false,
  themeToggle,
  dashboardUrl = DEFAULT_DASHBOARD_URL,
  keywordsUrl = DEFAULT_KEYWORDS_URL,
  labsUrl = DEFAULT_LABS_URL,
}: AppSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  // ----- URL resolution helpers -----
  const dashHref = resolveHref(currentApp, "dashboard", dashboardUrl, "/");
  const exploreHref = resolveHref(currentApp, "dashboard", dashboardUrl, "/apps");
  const kwHref = resolveHref(currentApp, "keywords", keywordsUrl, "/");
  const labsHref = resolveHref(currentApp, "labs", labsUrl, "/");

  // Footer links always live on the dashboard app
  const profileHref = resolveHref(currentApp, "dashboard", dashboardUrl, "/profile");
  const creditsHref = resolveHref(currentApp, "dashboard", dashboardUrl, "/credits");
  const billingHref = resolveHref(currentApp, "dashboard", dashboardUrl, "/billing");
  const settingsHref = resolveHref(currentApp, "dashboard", dashboardUrl, "/settings");

  // Active-state detection for dashboard sub-pages
  const isDashboardHome = currentApp === "dashboard" && (!pathname || pathname === "/");
  const isExploreApps = currentApp === "dashboard" && pathname === "/apps";
  const isKeywords = currentApp === "keywords";
  const isLabs = currentApp === "labs";

  // Active-state style overrides (data-[active=true]: needed to beat sidebar.tsx CVA specificity)
  const activeClass = "bg-brand-indigo text-white hover:bg-brand-indigo/90 hover:text-white data-[active=true]:bg-brand-indigo data-[active=true]:text-white";

  return (
    <Sidebar collapsible="icon" className="border-r">
      {/* Collapse toggle */}
      <CollapseToggle />

      {/* ---- Header ---- */}
      <SidebarHeader className={cn("p-4", isCollapsed && "p-2 items-center")}>
        <a href={dashHref} className={cn("flex items-center gap-3", isCollapsed && "justify-center")}>
          <img
            src="/brand/BFE_Icon_TRN.png"
            alt="BFEAI"
            className={cn("rounded-lg shrink-0", isCollapsed ? "h-8 w-8" : "h-10 w-10")}
          />
          <span
            className={cn(
              "text-lg font-bold tracking-tight",
              isCollapsed && "hidden",
            )}
          >
            BFEAI
          </span>
        </a>
      </SidebarHeader>

      {/* ---- Navigation ---- */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>MENU</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isDashboardHome}
                  tooltip="Dashboard"
                  className={isDashboardHome ? activeClass : undefined}
                >
                  <a href={dashHref}>
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Explore Apps */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isExploreApps}
                  tooltip="Explore Apps"
                  className={isExploreApps ? activeClass : undefined}
                >
                  <a href={exploreHref}>
                    <Sparkles />
                    <span>Explore Apps</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Keyword Agent */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isKeywords}
                  tooltip="Keyword Agent"
                  className={isKeywords ? activeClass : undefined}
                >
                  <a href={kwHref}>
                    <Search />
                    <span>Keyword Agent</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* LABS */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isLabs}
                  tooltip="LABS"
                  className={isLabs ? activeClass : undefined}
                >
                  <a href={labsHref}>
                    <FlaskConical />
                    <span>LABS</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ---- Footer ---- */}
      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          {/* User profile */}
          {user && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={user.fullName ?? user.email}>
                <a href={profileHref} className="flex items-center gap-2">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className={cn("rounded-full object-cover shrink-0", isCollapsed ? "h-5 w-5" : "h-8 w-8")}
                    />
                  ) : (
                    <span className={cn("flex items-center justify-center rounded-full bg-brand-indigo/10 font-medium shrink-0", isCollapsed ? "h-5 w-5 text-[10px]" : "h-8 w-8 text-xs")}>
                      {getInitials(user.fullName)}
                    </span>
                  )}
                  <span className={cn("flex flex-col leading-tight", isCollapsed && "hidden")}>
                    {user.fullName && (
                      <span className="truncate text-sm font-medium">{user.fullName}</span>
                    )}
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {/* Credits */}
          {credits !== null && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={`${credits.total} credits`}>
                <a href={creditsHref}>
                  <Coins className="text-amber-500" />
                  <span className={cn(isCollapsed && "hidden")}>
                    <span className="font-semibold">{credits.total}</span>{" "}
                    <span className="text-xs text-muted-foreground">credits</span>
                  </span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {/* Manage Payments */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Manage Payments">
              <a href={billingHref}>
                <CreditCard />
                <span className={cn(isCollapsed && "hidden")}>Manage Payments</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Settings */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <a href={settingsHref}>
                <Settings />
                <span className={cn(isCollapsed && "hidden")}>Settings</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Support */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Support">
              <a href="mailto:support@bfeai.com">
                <Headphones />
                <span className={cn(isCollapsed && "hidden")}>Support</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Theme toggle */}
          {themeToggle && (
            <SidebarMenuItem>
              <div className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", isCollapsed && "justify-center px-0")}>
                {themeToggle}
                <span className={cn("text-sm", isCollapsed && "hidden")}>Theme</span>
              </div>
            </SidebarMenuItem>
          )}

          {/* Log out */}
          <SidebarMenuItem>
            <Button
              variant="outline"
              size="sm"
              className={cn("justify-start gap-2", isCollapsed ? "h-8 w-8 p-0 justify-center" : "w-full")}
              onClick={onLogout}
              disabled={isLoggingOut}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className={cn(isCollapsed && "hidden")}>
                {isLoggingOut ? "Logging out..." : "Log out"}
              </span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
