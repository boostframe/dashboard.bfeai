import { Coins, TrendingUp, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Progress,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@bfeai/ui";
import type { CreditBalance } from "@/services/BillingService";

type CreditBalanceCardProps = {
  balance: CreditBalance | null;
  isLoading?: boolean;
  /** If provided, renders a link/button to navigate to credits page */
  onViewCredits?: () => void;
};

export const CreditBalanceCard = ({
  balance,
  isLoading,
  onViewCredits,
}: CreditBalanceCardProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>Credits</CardDescription>
          <CardTitle className="text-lg">Credit Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 animate-pulse rounded-xl bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!balance) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>Credits</CardDescription>
          <CardTitle className="text-lg">Credit Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Subscribe to Keywords to start earning credits.
          </p>
        </CardContent>
      </Card>
    );
  }

  const capPercent = balance.cap > 0
    ? Math.min(100, Math.round((balance.subscriptionBalance / balance.cap) * 100))
    : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardDescription>Credits</CardDescription>
          <CardTitle className="text-lg">Credit Balance</CardTitle>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-purple text-white">
          <Coins className="h-5 w-5" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Total balance */}
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground">
            {balance.total.toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">credits available</span>
        </div>

        {/* Pool breakdown */}
        <div className={`grid gap-3 ${balance.trialBalance > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
          {balance.trialBalance > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                    <p className="text-xs text-amber-600 dark:text-amber-400">Trial</p>
                    <p className="text-lg font-semibold text-foreground">
                      {balance.trialBalance.toLocaleString()}
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Trial credits from your $1 trial. Used first.</p>
                  <p>These expire at the end of your trial period.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-xl border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Subscription</p>
                  <p className="text-lg font-semibold text-foreground">
                    {balance.subscriptionBalance.toLocaleString()}
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Monthly credits from your subscription.</p>
                <p>Caps at {balance.cap.toLocaleString()} (3x monthly).</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-xl border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Top-up</p>
                  <p className="text-lg font-semibold text-foreground">
                    {balance.topupBalance.toLocaleString()}
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Credits from top-up purchases. No cap.</p>
                <p>These are used after trial credits.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Subscription cap progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Subscription pool</span>
            <span>
              {balance.subscriptionBalance.toLocaleString()} / {balance.cap.toLocaleString()}
            </span>
          </div>
          <Progress value={capPercent} className="h-2" />
          {capPercent >= 100 && (
            <p className="text-xs text-amber-600">
              Subscription credits at cap. Monthly allocation paused until you use some.
            </p>
          )}
        </div>

        {/* Lifetime stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Earned: {balance.lifetimeEarned.toLocaleString()}
          </span>
          <span>Spent: {balance.lifetimeSpent.toLocaleString()}</span>
        </div>
      </CardContent>

      {onViewCredits && (
        <CardFooter>
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-2"
            onClick={onViewCredits}
          >
            View credit history
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};
