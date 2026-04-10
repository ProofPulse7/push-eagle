import { ArrowUpRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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

const campaigns = [
    {
      name: "Summer Sale Kickoff",
      impressions: "250,000",
      clicks: "39,000",
      ctr: "15.6%",
      revenue: 5302.50
    },
    {
      name: "New Arrivals: Mens",
      impressions: "180,500",
      clicks: "18,411",
      ctr: "10.2%",
      revenue: 3120.00
    },
    {
      name: "Flash Sale Reminder",
      impressions: "86,000",
      clicks: "18,146",
      ctr: "21.1%",
      revenue: 4500.00
    },
    {
      name: "Weekly Newsletter",
      impressions: "1,200,000",
      clicks: "120,000",
      ctr: "10.0%",
      revenue: 12500.00
    },
     {
      name: "Father's Day Special",
      impressions: "350,000",
      clicks: "24,500",
      ctr: "7.0%",
      revenue: 2800.75
    },
]

export function RecentActivity() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center">
        <div className="grid gap-2">
            <CardTitle>Recent Campaigns</CardTitle>
            <CardDescription>
                An overview of your last 5 campaigns.
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
              <TableHead className="text-right">Impressions</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">Avg. CTR</TableHead>
              <TableHead className="text-right">Revenue Generated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.name}>
                <TableCell>
                  <div className="font-medium">{campaign.name}</div>
                </TableCell>
                <TableCell className="text-right">{campaign.impressions}</TableCell>
                <TableCell className="text-right">{campaign.clicks}</TableCell>
                <TableCell className="text-right">{campaign.ctr}</TableCell>
                <TableCell className="text-right">{formatCurrency(campaign.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
