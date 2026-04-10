
'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { MobileSidebar } from './mobile-sidebar';

export function Header() {
    return (
        <header className="flex h-16 items-center gap-4 border-b bg-card px-4 md:px-6 sticky top-0 z-30">
            <div className="md:hidden">
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="icon">
                            <Menu className="h-5 w-5" />
                            <span className="sr-only">Toggle navigation menu</span>
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0">
                        <MobileSidebar />
                    </SheetContent>
                </Sheet>
            </div>

            <div className="w-full flex-1" />

        </header>
    );
}
