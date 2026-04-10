
'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Check, Info, Mail, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const businessTiers = [
    { impressions: 10000, price: 8 },
    { impressions: 20000, price: 15 },
    { impressions: 30000, price: 21 },
    { impressions: 50000, price: 32 },
];

const enterpriseTiers = [
    { impressions: 50000, price: 50 },
    { impressions: 75000, price: 70 },
    { impressions: 100000, price: 90 },
    { impressions: 150000, price: 125 },
    { impressions: 250000, price: 190 },
    { impressions: 350000, price: 250 },
    { impressions: 500000, price: 350 },
    { impressions: 1000000, price: 650 },
    { impressions: 1500000, price: 900 },
    { impressions: 2000000, price: 1100 },
    { impressions: 2500000, price: 1350 },
    { impressions: 3000000, price: 1550 },
    { impressions: 3500000, price: 1750 },
    { impressions: 4000000, price: 1950 },
    { impressions: 4500000, price: 2100 },
    { impressions: 5000000, price: 2250 },
];


const PlanCard = ({ plan, onSelectPlan, selectedPlan }: {
    plan: {
        name: string;
        tiers: { impressions: number; price: number }[];
        features: string[];
    };
    onSelectPlan: (planName: string, tierIndex: number) => void;
    selectedPlan: { name: string; tierIndex: number };
}) => {
    const isCurrent = plan.name === selectedPlan.name;
    const [selectedTierIndex, setSelectedTierIndex] = useState(isCurrent ? selectedPlan.tierIndex : 0);

    const tier = plan.tiers[selectedTierIndex];

    const handleSliderChange = (value: number[]) => {
        setSelectedTierIndex(value[0]);
    };
    
    return (
        <Card className={cn("flex flex-col", isCurrent ? 'border-primary ring-2 ring-primary' : '')}>
            <CardHeader className={cn("rounded-t-lg text-white", isCurrent ? "bg-primary" : "bg-gray-800")}>
                <CardTitle className="text-center text-xl">{plan.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow pt-8">
                <div className="text-center space-y-4">
                    <p className="text-5xl font-bold">
                        ${tier.price}
                        <span className="text-lg font-normal text-muted-foreground">/mo</span>
                    </p>
                    <div className="space-y-4 pt-4">
                        {plan.tiers.length > 1 ? (
                            <Slider
                                defaultValue={[selectedTierIndex]}
                                max={plan.tiers.length - 1}
                                step={1}
                                onValueChange={handleSliderChange}
                            />
                        ) : null}
                        <div className="flex justify-center items-center gap-2">
                             <p className="text-lg font-semibold text-foreground">{tier.impressions.toLocaleString()}</p>
                            <p className="text-muted-foreground">Impressions per month</p>
                            <Info className="w-4 h-4 text-muted-foreground" />
                        </div>
                    </div>
                </div>

                <ul className="mt-8 space-y-3 text-sm">
                    {plan.features.map(feature => (
                        <li key={feature} className="flex items-center gap-3">
                            <Check className="w-5 h-5 text-green-500" />
                            <span className="text-muted-foreground">{feature}</span>
                        </li>
                    ))}
                </ul>
            </CardContent>
            <CardFooter className="flex-col gap-4 pt-6 mt-auto">
                {isCurrent && (
                    <div className="w-full bg-muted/50 p-3 rounded-lg text-center text-sm mb-2">
                        <p className="font-bold">CURRENT PLAN</p>
                        <p className="text-muted-foreground">Impressions per calendar month ({tier.impressions.toLocaleString()})</p>
                        <p className="text-muted-foreground text-xs">Your impression limit resets on 8/1/2025, 5:00:00 AM</p>
                    </div>
                )}
                <Button 
                    size="lg" 
                    className={cn("w-full", isCurrent && "bg-gray-300 text-gray-500 hover:bg-gray-300 cursor-not-allowed")} 
                    disabled={isCurrent}
                    onClick={() => onSelectPlan(plan.name, selectedTierIndex)}
                >
                    {isCurrent ? "Current Plan" : "Select"}
                </Button>
            </CardFooter>
        </Card>
    );
};


export default function PlansPage() {
    const [selectedPlan, setSelectedPlan] = useState({ name: 'Basic', tierIndex: 0 });

    const plans = [
        {
            name: "Basic",
            tiers: [{ impressions: 500, price: 0 }],
            features: [
                "Unlimited Subscribers",
                "Send Campaigns",
                "Schedule Campaigns",
                "Duplicate Campaigns",
                "Basic Reports",
                "Chat Support",
            ],
        },
        {
            name: "Business",
            tiers: businessTiers,
            features: [
                "All Basic Features",
                "Abandoned Cart Automation",
                "Hero Image Support",
                "Email Reports",
            ],
        },
        {
            name: "Enterprise",
            tiers: enterpriseTiers,
            features: [
                "All Business Features",
                "Segmentation",
                "Flash Sale",
                "Smart Delivery",
                "Checkout Recovery",
                "Custom Attribution Window",
                "Subscriber Details",
                "Shipping Notification",
            ],
        },
    ];
    
    const handleSelectPlan = (planName: string, tierIndex: number) => {
        setSelectedPlan({ name: planName, tierIndex });
    };

    return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
       <div className="bg-card rounded-lg shadow-sm p-4 flex justify-between items-center relative overflow-hidden">
            <div>
                 <h1 className="text-xl font-bold flex items-center gap-2">
                    Pricing 🤑
                </h1>
            </div>
            <div className="absolute -right-20 -top-10 opacity-10">
                 <Image 
                    src="https://cdn.jsdelivr.net/gh/firebounty/sw-assests@main/pricing-banner.png" 
                    alt="Decorative banner"
                    width={400}
                    height={150}
                    className="w-auto h-auto"
                />
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
            {plans.map(plan => (
                <PlanCard 
                    key={plan.name}
                    plan={plan}
                    onSelectPlan={handleSelectPlan}
                    selectedPlan={selectedPlan}
                />
            ))}
        </div>

        <Card className="flex flex-col md:flex-row items-center justify-between gap-6 p-8">
            <div className="space-y-2">
                <CardTitle className="text-2xl">Custom Enterprise</CardTitle>
                <CardDescription>
                    For large-scale businesses with custom needs. Get a personalized package.
                </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" variant="outline">
                    <Mail className="mr-2 h-5 w-5" />
                    Contact us via Email
                </Button>
                <Button size="lg">
                    <MessageSquare className="mr-2 h-5 w-5" />
                    Chat with us
                </Button>
            </div>
        </Card>
    </div>
  );
}
