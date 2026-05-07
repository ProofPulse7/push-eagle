
'use client';

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";

type ActionButton = { title: string; link: string };

export const ActionButtonsEditor = ({
    actionButtons,
    setActionButtons,
}: {
    actionButtons: ActionButton[];
    setActionButtons: (buttons: ActionButton[]) => void;
}) => {
    
    const handleAddButton = () => {
        if (actionButtons.length < 2) {
            setActionButtons([...actionButtons, { title: '', link: '' }]);
        }
    };

    const handleRemoveButton = (index: number) => {
        setActionButtons(actionButtons.filter((_, i) => i !== index));
    };

    const handleButtonChange = (index: number, field: 'title' | 'link', value: string) => {
        const newButtons = [...actionButtons];
        newButtons[index][field] = value;
        setActionButtons(newButtons);
    };

    return (
        <div className="space-y-4 pt-2 p-4">
            <Label>Action Buttons</Label>
            {actionButtons.map((button, index) => (
                <div key={index} className="space-y-2 rounded-md border p-3">
                    <div className="flex justify-between items-center">
                        <p className="text-sm font-medium">Button {index + 1}</p>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveButton(index)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`btn-title-${index}`}>Title</Label>
                        <Input id={`btn-title-${index}`} placeholder="e.g., Shop Now" value={button.title} onChange={(e) => handleButtonChange(index, 'title', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`btn-link-${index}`}>Link</Label>
                        <Input id={`btn-link-${index}`} placeholder="https://..." value={button.link} onChange={(e) => handleButtonChange(index, 'link', e.target.value)} />
                    </div>
                </div>
            ))}
            {actionButtons.length < 2 && (
                <Button variant="outline" className="w-full" onClick={handleAddButton}>
                    <Plus className="mr-2 h-4 w-4" /> Add button
                </Button>
            )}
        </div>
    );
}
