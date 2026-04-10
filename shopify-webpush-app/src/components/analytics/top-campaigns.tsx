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

const initialCampaigns = [
    { name: "Summer Sale 2024", revenue: 5302.50, clicks: "12,832", impressions: "128,320" },
    { name: "New Arrivals - June", revenue: 3120.00, clicks: "8,430", impressions: "84,300" },
    { name: "Flash Friday", revenue: 2890.75, clicks: "15,201", impressions: "152,010" },
    { name: "Father's Day Special", revenue: 1500.20, clicks: "5,600", impressions: "56,000" },
    { name: "Weekend Deal", revenue: 980.00, clicks: "4,100", impressions: "41,000" },
]

const generateData = () => {
    return initialCampaigns.map(c => ({
        ...c,
        revenue: c.revenue * (Math.random() * (1.2 - 0.8) + 0.8),
        clicks: (parseInt(c.clicks.replace(/,/g, '')) * (Math.random() * (1.2 - 0.8) + 0.8)).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
        impressions: (parseInt(c.impressions.replace(/,/g, '')) * (Math.random() * (1.2 - 0.8) + 0.8)).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
    })).sort((a,b) => b.revenue - a.revenue);
}

export function TopCampaigns({ dateRange }: { dateRange: DateRange | undefined }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);

  useEffect(() => {
      setCampaigns(generateData());
  }, [dateRange]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center">
        <div className="grid gap-2">
            <CardTitle>Top Performing Campaigns</CardTitle>
            <CardDescription>
                Your most successful manual campaigns by revenue.
            </CardDescription>
        </div>
        <Button asChild size="sm" className="ml-auto gap-1">
          <Link href="/campaigns">
            View All
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.name}>
                <TableCell>
                  <div className="font-medium">{campaign.name}</div>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(campaign.revenue)}</TableCell>
                <TableCell className="text-right">{campaign.impressions}</TableCell>
                <TableCell className="text-right">{campaign.clicks}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
