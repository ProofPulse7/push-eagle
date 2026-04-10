import { Card, CardContent } from '@/components/ui/card';

type FlowStatsData = {
    inQueue: number;
    impressions: number;
    clicks: number;
}

export function FlowStats({ stats }: { stats: FlowStatsData }) {

    const statsData = [
        { label: "In Queue", value: stats.inQueue.toLocaleString() },
        { label: "Impressions", value: stats.impressions.toLocaleString() },
        { label: "Clicks", value: stats.clicks.toLocaleString() }
    ];

    return (
        <Card>
            <CardContent className="p-0">
               <div className="flex flex-wrap">
                    {statsData.map((stat) => (
                       <div key={stat.label} className="w-full sm:w-1/3 p-6 flex-grow border-b last:border-b-0 sm:border-b-0 md:border-r last:md:border-r-0">
                            <p className="text-sm text-muted-foreground">{stat.label}</p>
                            <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                       </div>
                    ))}
               </div>
            </CardContent>
        </Card>
    );
}
