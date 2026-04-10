'use client';

import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"

const initialAutomations = [
    { name: "Abandoned Cart Recovery", revenue: 8450.30, clicks: "22,100", impressions: "221,000" },
    { name: "Welcome Series", revenue: 4200.00, clicks: "18,500", impressions: "185,000" },
    { name: "Browse Abandonment", revenue: 2110.50, clicks: "9,800", impressions: "98,000" },
    { name: "Back in Stock", revenue: 1230.00, clicks: "4,500", impressions: "45,000" },
    { name: "Price Drop", revenue: 698.00, clicks: "3,200", impressions: "32,000" },
];

const generateData = () => {
    return initialAutomations.map(c => ({
        ...c,
        revenue: c.revenue * (Math.random() * (1.2 - 0.8) + 0.8),
        clicks: (parseInt(c.clicks.replace(/,/g, '')) * (Math.random() * (1.2 - 0.8) + 0.8)).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
        impressions: (parseInt(c.impressions.replace(/,/g, '')) * (Math.random() * (1.2 - 0.8) + 0.8)).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
    })).sort((a,b) => b.revenue - a.revenue);
}

export function TopAutomations({ dateRange }: { dateRange: DateRange | undefined }) {
  const [automations, setAutomations] = useState(initialAutomations);
  
  useEffect(() => {
      setAutomations(generateData());
  }, [dateRange]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center">
        <div className="grid gap-2">
            <CardTitle>Top Performing Automations</CardTitle>
            <CardDescription>
                Your most successful automated flows by revenue.
            </CardDescription>
        </div>
        <Button asChild size="sm" className="ml-auto gap-1">
          <Link href="/automations">
            View All
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Automation</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {automations.map((automation) => (
              <TableRow key={automation.name}>
                <TableCell>
                  <div className="font-medium">{automation.name}</div>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(automation.revenue)}</TableCell>
                <TableCell className="text-right">{automation.impressions}</TableCell>
                <TableCell className="text-right">{automation.clicks}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
