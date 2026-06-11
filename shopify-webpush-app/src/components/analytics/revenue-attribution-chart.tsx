'use client';

import { Pie, PieChart, ResponsiveContainer, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const chartConfig = {
  revenue: {
    label: 'Revenue',
  },
  campaigns: {
    label: 'Campaigns',
    color: 'hsl(var(--chart-1))',
  },
  automations: {
    label: 'Automations',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-base font-bold"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

type AttributionPoint = {
  source: string;
  revenue: number;
  fill: string;
};

export default function RevenueAttributionChart({ data }: { data: AttributionPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square w-full max-w-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Pie
            data={data}
            dataKey="revenue"
            nameKey="source"
            innerRadius={50}
            outerRadius={110}
            paddingAngle={2}
            strokeWidth={2}
            labelLine={false}
            label={renderCustomizedLabel}
          >
            {data.map((entry) => (
              <Cell key={entry.source} fill={entry.fill} className="outline-none" />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
