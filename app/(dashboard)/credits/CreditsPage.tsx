'use client';

import { useState } from "react";
import { Search, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@bfeai/ui";
import { useCredits } from "@/hooks/useCredits";
import { CreditBalanceCard } from "@/components/billing/CreditBalanceCard";
import { CreditHistoryTable } from "@/components/billing/CreditHistoryTable";
import { TopUpPacksGrid } from "@/components/billing/TopUpPacksGrid";

const PAGE_SIZE = 20;

export function CreditsPage() {
  const [page, setPage] = useState(0);

  const {
    balance,
    balanceLoading,
    transactions,
    totalTransactions,
    historyLoading,
    purchaseTopUp,
    topUpLoading,
  } = useCredits(PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-8">
      {/* Top row: Balance card + explanation */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CreditBalanceCard balance={balance} isLoading={balanceLoading} />

        <Card>
          <CardHeader>
            <CardTitle>How credits work</CardTitle>
            <CardDescription>Credits power everything you do across BFEAI apps.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/50 p-3">
                <p className="font-semibold text-foreground">Monthly allocation</p>
                <p>Each app subscription grants monthly credits that refresh on your billing date. Unused credits carry over up to a cap.</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/50 p-3">
                <p className="font-semibold text-foreground">Top-up credits</p>
                <p>Buy extra credits anytime. They never expire and are used first before your monthly balance.</p>
              </div>
            </div>

            {/* Per-app usage examples */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-brand-indigo to-brand-purple text-white">
                    <Search className="h-3.5 w-3.5" />
                  </div>
                  <p className="font-semibold text-foreground">Keywords</p>
                  <span className="ml-auto text-xs">300 credits/mo</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Keyword research report</span>
                    <span className="font-medium text-foreground">20-30 credits</span>
                  </div>
                  <div className="flex justify-between">
                    <span>AI keyword expansion</span>
                    <span className="font-medium text-foreground">Included in report</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SERP & difficulty analysis</span>
                    <span className="font-medium text-foreground">Included in report</span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-brand-teal to-brand-indigo text-white">
                    <Eye className="h-3.5 w-3.5" />
                  </div>
                  <p className="font-semibold text-foreground">LABS</p>
                  <span className="ml-auto text-xs">300 credits/mo</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>AI visibility scan (per engine)</span>
                    <span className="font-medium text-foreground">1 credit</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Invisibility diagnosis</span>
                    <span className="font-medium text-foreground">1 credit</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Full 6-engine scan</span>
                    <span className="font-medium text-foreground">6 credits</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top-up packs */}
      <TopUpPacksGrid onPurchase={purchaseTopUp} purchaseLoading={topUpLoading} />

      {/* Transaction history */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
          <CardDescription>All credit allocations, purchases, and usage.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreditHistoryTable
            transactions={transactions}
            total={totalTransactions}
            isLoading={historyLoading}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
