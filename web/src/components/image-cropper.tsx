"use client";

import { useState, useRef, useEffect } from "react";
import { X, ZoomIn, Crop, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageCropperModalProps {
  imageSrc: string; // Original base64 or object URL of the selected image
  onCrop: (croppedBase64: string) => void;
  onSkip: () => void;
  onCancel: () => void;
  aspectRatio?: number; // e.g. 1 for square (favicon, logo), etc.
}

export function ImageCropperModal({
  imageSrc,
  onCrop,
  onSkip,
  onCancel,
  aspectRatio = 1
}: ImageCropperModalProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport size inside the modal (e.g., 240px wide)
  const viewportWidth = 240;
  const viewportHeight = viewportWidth / aspectRatio;

  // Handle dragging/panning the image inside the crop viewport
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // Support mobile touch gestures for panning
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    const touch = e.touches[0];
    dragStart.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPosition({
      x: touch.clientX - dragStart.current.x,
      y: touch.clientY - dragStart.current.y
    });
  };

  // Execute Crop on HTML5 Canvas
  const handleExecuteCrop = () => {
    const img = imageRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    // Create offscreen canvas matching target viewport resolution
    const canvas = document.createElement("canvas");
    canvas.width = viewportWidth * 2; // multiply by 2 for higher resolution/retina screen quality
    canvas.height = viewportHeight * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Calculate dimensions
    const rect = img.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Horizontal and vertical offsets relative to the center viewport box
    const viewportLeft = (containerRect.width - viewportWidth) / 2;
    const viewportTop = (containerRect.height - viewportHeight) / 2;

    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;

    // Crop box coordinates mapped back onto the original source image
    const sourceX = (containerRect.left + viewportLeft - rect.left) * scaleX;
    const sourceY = (containerRect.top + viewportTop - rect.top) * scaleY;
    const sourceWidth = viewportWidth * scaleX;
    const sourceHeight = viewportHeight * scaleY;

    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const croppedBase64 = canvas.toDataURL("image/png");
    onCrop(croppedBase64);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface border border-hairline w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-scale-up space-y-4 p-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-3.5">
          <div>
            <h3 className="font-bold text-base text-ink flex items-center gap-1.5">
              <Crop className="size-4.5 text-[#5b73e8]" />
              Adjust Image Fit
            </h3>
            <p className="text-xs text-ink-3 mt-0.5">Drag to position, use the slider to zoom</p>
          </div>
          <button 
            onClick={onCancel}
            className="size-8 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors grid place-items-center text-ink-2"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Drag and Crop Area */}
        <div className="flex justify-center py-2">
          <div 
            ref={containerRef}
            className="relative w-80 h-80 bg-zinc-950 rounded-2xl overflow-hidden select-none cursor-move flex items-center justify-center"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUpOrLeave}
          >
            {/* Draggable original image */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Source preview"
              draggable={false}
              className="absolute max-w-none origin-center transition-transform duration-75 pointer-events-none"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                maxHeight: "100%",
                maxWidth: "100%"
              }}
            />

            {/* Dark Masking Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Surrounding backdrop shade */}
              <div className="absolute inset-0 bg-black/60"></div>
              {/* Highlighted Crop Viewport Box */}
              <div 
                className="relative z-10 border border-white/50 bg-transparent rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
                style={{ width: `${viewportWidth}px`, height: `${viewportHeight}px` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Zoom Slider */}
        <div className="space-y-2 px-1">
          <div className="flex items-center justify-between text-xs text-ink-3 font-semibold">
            <span className="flex items-center gap-1">
              <ZoomIn className="size-3.5" />
              Scale / Zoom
            </span>
            <span className="tnum">{Math.round(zoom * 100)}%</span>
          </div>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full h-1 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-[#5b73e8]"
          />
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between border-t border-hairline pt-4 bg-surface">
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            className="h-10 px-4 font-bold text-ink-2 hover:bg-surface-2 rounded-xl flex items-center gap-1"
          >
            Skip Crop
            <ArrowRight className="size-3.5" />
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="h-10 px-4 font-bold text-ink-2 hover:bg-surface-2 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleExecuteCrop}
              className="h-10 px-5 font-bold text-white bg-[#5b73e8] hover:bg-indigo-600 rounded-xl hover:shadow-[0_8px_16px_rgba(91,115,232,0.25)] transition-all duration-300"
            >
              Crop & Apply
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
