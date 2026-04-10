
'use client';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Star, ShoppingBag, Upload, ImageIcon, Crop } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ImageEditorSheet } from '@/components/composer/editor-parts/image-editor-sheet';
import { useSettings } from '@/context/settings-context';


const ShopifyIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        {...props}
    >
        <path d="M19.382 6.548c-.035-.022-.07-.044-.108-.064-.002 0-.004-.002-.006-.002h-.002c-.033-.018-.067-.034-.1-.05-.005-.002-.008-.004-.013-.006-.036-.016-.07-.03-.106-.044-.003 0-.006-.002-.008-.002a2.33 2.33 0 00-.11-.038c-.004-.002-.008-.002-.012-.004s-.06-.02-.092-.028a2.189 2.189 0 00-.115-.026c-.005-.002-.01-.002-.015-.004a1.833 1.833 0 00-.19-.03c-.006 0-.01-.002-.016-.002a2.126 2.126 0 00-.12-.014c-.01 0-.02-.002-.03-.002a2.149 2.149 0 00-.12-.01c-.01 0-.02 0-.03.002h-.002c-.12 0-.24-.002-.36-.002h-5.91c-1.11 0-2.13.43-2.88 1.18-.75.75-1.18 1.77-1.18 2.88v5.91c0 .12.002.24.002.36v.002c0 .01.002.02.002.03a2.149 2.149 0 00.01.12c0 .01.002.02.002.03a2.126 2.126 0 00.014.12c0 .006.002.01.002.016a1.833 1.833 0 00.03.19c.002.005.002.01.004.015a2.189 2.189 0 00.026.115c.002.004.004.008.006.012.008.032.02.06.028.092.002.004.004.008-.006.012a2.189 2.189 0 00-.026.115c-.002.005-.002.01-.004.015a1.833 1.833 0 00-.03.19c0 .006-.002.01-.002.016a2.126 2.126 0 00-.014.12c0 .01-.002.02-.002.03a2.149 2.149 0 00-.01.12v.002c0 .12-.002.24-.002.36v5.91c0 1.11.43 2.13 1.18 2.88.75.75 1.77 1.18 2.88 1.18h5.91c.12 0 .24-.002.36-.002h.002c.01 0 .02-.002.03-.002a2.149 2.149 0 00.12-.01c.01 0 .02-.002.03-.002a2.126 2.126 0 00.12-.014c.006 0 .01-.002.016-.002a1.833 1.833 0 00.19-.03c.005 0 .01-.002.015-.004a2.189 2.189 0 00.115-.026c.004-.002.008-.004.012-.006.032-.008.06-.02.092-.028.004-.002.008-.002.012-.004a2.33 2.33 0 00.11-.038c.004-.002.006-.004.008-.008.036-.014.07-.028.106-.044.005-.002.008-.004.013-.006.033-.018.067-.032.1-.05v-.002c.038-.02.072-.04.108-.064v-.002a1.85 1.85 0 00.106-.063c.006-.005.01-.01.015-.016.02-.02.04-.04.06-.06.006-.008.013-.015.019-.023a2.43 2.43 0 00.152-.22c1.9 1.42 3.16 3.66 3.16 6.19a7.25 7.25 0 01-7.25 7.25c-3.98 0-7.25-3.27-7.25-7.25a7.25 7.25 0 013.16-6.19 2.43 2.43 0 00.152-.22c.006-.008.013-.015.019-.023.02-.02.04-.04.06-.06.005-.006.01-.01.015-.016.035-.023.07-.047.106-.07v-.002z" />
    </svg>
);

const testimonials = [
    {
        author: 'Wicked Good Perfume',
        text: "Simple to install. Simple to use. Our last Push Eagle campaign brought in over $1000 USD of sales. This is the easiest one-click marketing in the world. The customer service is hands-down, the best. Responsive, helpful and fast."
    },
    {
        author: 'Urban Minimalist',
        text: "We've seen a 25% increase in recovered carts since installing Push Eagle. The automations are a game-changer for our small team. Highly recommended!"
    },
    {
        author: 'Gourmet Gadgets',
        text: "The segmentation feature is incredibly powerful. We can target our customers with pinpoint accuracy, which has boosted our conversion rates significantly. A must-have for any serious e-commerce store."
    },
     {
        author: 'The Artful Parent',
        text: "Push Eagle has become an essential part of our marketing strategy. The welcome notifications have boosted our subscriber engagement by 40%!"
    },
    {
        author: 'Eco-Friendly Finds',
        text: "The back-in-stock and price drop alerts are fantastic. We've recovered so many potential lost sales. The support team is also amazing."
    }
];

export default function LoginPage() {
    const router = useRouter();
    const { logo, setLogo } = useSettings();
    const logoInputRef = useRef<HTMLInputElement>(null);
    const [currentTestimonial, setCurrentTestimonial] = useState(0);
    const [animationClass, setAnimationClass] = useState('');
    const [editingState, setEditingState] = useState<{ url: string; aspect: number, type: string } | null>(null);


    useEffect(() => {
        const interval = setInterval(() => {
            setAnimationClass('slide-out');
            setTimeout(() => {
                setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
                setAnimationClass('slide-in');
            }, 500); // This should match the animation duration
        }, 5000);

        return () => clearInterval(interval);
    }, []);


    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                setLogo({ file, preview: base64String });
            };
            reader.readAsDataURL(file);
        }
    };
    
     const handleSaveCrop = (dataUrl: string) => {
        setLogo({ file: null, preview: dataUrl });
        setEditingState(null);
    };

    return (
        <div className="flex min-h-screen">
            <div className="flex flex-col items-center justify-center p-8 lg:p-12 lg:basis-3/5">
                <div className="max-w-md w-full space-y-12">
                    <div className="space-y-4 text-center">
                         <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-gray-900">
                            Thank you for installing Push Eagle!
                        </h1>
                        <p className="text-gray-600">
                                    Let&apos;s get you set up to engage your audience with powerful push notifications. Drive repeat sales and recover abandoned carts with our easy-to-use web push campaigns.
                        </p>
                    </div>

                    <div className="space-y-6">
                         <div className="space-y-4">
                             <h2 className="text-lg font-semibold text-center">Step 1: Add Your Brand Logo</h2>
                             <div className="flex justify-center items-center gap-4">
                                <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center border-2 border-dashed">
                                    {logo.preview ? (
                                        <img src={logo.preview} alt="Brand Logo" className="w-full h-full object-contain rounded-full" />
                                    ) : (
                                        <ImageIcon className="w-10 h-10 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="outline" onClick={() => logoInputRef.current?.click()}>
                                        <Upload className="mr-2 h-4 w-4" />
                                        Upload Logo
                                    </Button>
                                     <Button variant="outline" size="icon" onClick={() => logo.preview && setEditingState({ url: logo.preview, aspect: 1, type: 'logo' })} disabled={!logo.preview}>
                                        <Crop className="h-4 w-4" />
                                    </Button>
                                </div>
                                <input
                                    type="file"
                                    ref={logoInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                />
                            </div>
                         </div>
                         <div className="w-full text-center">
                             <Button size="lg" asChild className="bg-primary hover:bg-primary/90">
                                <Link href="/login/step-2">Get started</Link>
                            </Button>
                        </div>
                        <div className="space-y-2">
                            <Progress value={50} className="w-full" />
                            <p className="text-sm text-center text-gray-500">
                                Setup Push Eagle 1 / 2
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="hidden lg:flex bg-[#203741] p-12 items-center justify-center relative overflow-hidden lg:basis-2/5">
                {/* Background pattern */}
                <div className="absolute inset-0 opacity-5">
                    <ShoppingBag className="absolute -left-12 -top-12 h-48 w-48 text-white" />
                    <ShoppingBag className="absolute -right-12 bottom-12 h-48 w-48 text-white" />
                     <ShoppingBag className="absolute right-24 top-24 h-32 w-32 text-white" />
                     <ShoppingBag className="absolute left-24 bottom-48 h-24 w-24 text-white" />
                </div>
                
                <div className={cn("relative w-full max-w-sm", animationClass)}>
                    <div className="bg-white rounded-lg shadow-2xl p-6 space-y-4">
                        <div className="flex items-center gap-4">
                            <ShopifyIcon className="w-8 h-8 text-green-600" />
                            <div className="flex items-center">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} className="w-5 h-5 text-green-500 fill-current" />
                                ))}
                            </div>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed min-h-[140px]">
                           {testimonials[currentTestimonial].text}
                        </p>
                        <p className="font-semibold text-gray-800">
                           {testimonials[currentTestimonial].author}
                        </p>
                    </div>
                </div>
            </div>
            <ImageEditorSheet 
                editingState={editingState} 
                setEditingState={setEditingState} 
                onSave={handleSaveCrop}
            />
        </div>
    )
}
