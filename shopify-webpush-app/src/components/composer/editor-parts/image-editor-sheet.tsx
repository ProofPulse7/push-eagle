
'use client';

import { useState, useRef, useEffect } from 'react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

import { Button } from "@/components/ui/button";
import { 
    AlertDialog, 
    AlertDialogContent, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogFooter, 
    AlertDialogCancel, 
    AlertDialogAction 
} from "@/components/ui/alert-dialog";
import '@/components/composer/editor-parts/image-cropper.css';


function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}


export const ImageEditorSheet = ({ 
    editingState, 
    setEditingState,
    onSave,
}: { 
    editingState: { url: string; aspect: number, type: string } | null;
    setEditingState: (state: { url: string; aspect: number, type: string } | null) => void;
    onSave: (dataUrl: string, type: string) => void;
}) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<Crop>();
    
    const aspect = editingState?.aspect ?? 1;

    // Reset crop state when a new image is loaded
    useEffect(() => {
        if (editingState?.url) {
            setCrop(undefined);
            setCompletedCrop(undefined);
        }
    }, [editingState?.url]);


    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        if (aspect) {
            const { width, height } = e.currentTarget;
            setCrop(centerAspectCrop(width, height, aspect));
        }
    }

    const handleSave = () => {
        if (!completedCrop || !imgRef.current) {
            return;
        }

        const canvas = document.createElement('canvas');
        const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
        const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
        
        canvas.width = Math.floor(completedCrop.width * scaleX);
        canvas.height = Math.floor(completedCrop.height * scaleY);
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const cropX = completedCrop.x * scaleX;
        const cropY = completedCrop.y * scaleY;
        
        ctx.drawImage(
            imgRef.current,
            cropX,
            cropY,
            canvas.width,
            canvas.height,
            0,
            0,
            canvas.width,
            canvas.height
        );
        
        const base64Image = canvas.toDataURL('image/png');
        if (editingState) {
            onSave(base64Image, editingState.type);
        }
        setEditingState(null); 
    };

    const onClose = () => {
        setEditingState(null);
    };

    return (
        <AlertDialog open={!!editingState} onOpenChange={(open) => { if (!open) setEditingState(null); }}>
            <AlertDialogContent className="max-w-xl">
                {editingState?.url && (
                    <>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Edit Image</AlertDialogTitle>
                        </AlertDialogHeader>
                        <div className="py-4 flex justify-center bg-muted">
                           <ReactCrop 
                                crop={crop} 
                                onChange={(newCrop, percentCrop) => {
                                    if (newCrop.width > 0) {
                                      setCrop(percentCrop);
                                    }
                                  }}
                                onComplete={(c) => setCompletedCrop(c)}
                                aspect={aspect}
                           >
                                <img 
                                    ref={imgRef}
                                    src={editingState.url} 
                                    alt="Crop me" 
                                    onLoad={onImageLoad}
                                    style={{ maxHeight: '70vh' }}
                                />
                           </ReactCrop>
                        </div>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleSave}>Save Changes</AlertDialogAction>
                        </AlertDialogFooter>
                    </>
                )}
            </AlertDialogContent>
        </AlertDialog>
    );
};
