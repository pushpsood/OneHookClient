import { useState } from 'react';
import { X, Image, Sparkles, Mic, Upload, ArrowRight } from 'lucide-react';

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToProfile: () => void;
}

export function CreateModal({
  isOpen,
  onClose,
  onNavigateToProfile,
}: CreateModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div
        className="fixed inset-0"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-surface-card border border-border rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <div className="w-8" />
          <h3 className="text-base font-semibold text-text">Create new post</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-text-secondary hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-surface flex items-center justify-center text-text-secondary">
            <Image className="w-10 h-10 stroke-[1.5]" />
          </div>

          <div className="space-y-1">
            <h4 className="text-lg font-semibold text-text">Drag photos and videos here</h4>
            <p className="text-xs text-text-secondary max-w-xs">
              Upload photos, prompt answers, or voice recordings to update your profile.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2 w-full max-w-xs">
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToProfile();
              }}
              className="flex-1 py-2.5 px-4 bg-ig-blue hover:bg-ig-blue/90 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Select from computer</span>
            </button>
          </div>

          <div className="w-full pt-4 border-t border-border grid grid-cols-2 gap-3 text-left">
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToProfile();
              }}
              className="p-3 rounded-xl bg-surface hover:bg-surface-hover border border-border/60 transition-colors cursor-pointer flex flex-col gap-1 text-left"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                <Sparkles className="w-3.5 h-3.5 text-ig-blue" />
                <span>Add Prompt</span>
              </div>
              <span className="text-[11px] text-text-muted">Answer a conversation starter</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToProfile();
              }}
              className="p-3 rounded-xl bg-surface hover:bg-surface-hover border border-border/60 transition-colors cursor-pointer flex flex-col gap-1 text-left"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
                <Mic className="w-3.5 h-3.5 text-red-500" />
                <span>Voice Note</span>
              </div>
              <span className="text-[11px] text-text-muted">Record an audio intro</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
