import React, { useEffect, useState } from 'react';
import { MoreHorizontal, Pause, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { ITEMS } from '../game/blocks';
import { HudSnapshot } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  itemIcons: Record<number, string>;
  onSelectSlot: (idx: number) => void;
  onToggleMute: () => void;
  onToggleTouch: () => void;
  onOpenInventory: () => void;
  onPause: () => void;
}

function getTimeLabel(t: number): string {
  if (t < 0.12) return 'Morgen';
  if (t < 0.42) return 'Tag';
  if (t < 0.56) return 'Abend';
  return 'Nacht';
}

const PixelHeart: React.FC<{ state: 'full' | 'half' | 'empty' }> = ({ state }) => (
  <svg width="14" height="14" viewBox="0 0 9 9" className="pixelated sm:h-4 sm:w-4">
    <path
      d="M1 2h2v1h1v1h1V3h1V2h2v3H7v1H6v1H5v1H4V7H3V6H2V5H1V2z"
      fill="#1b1b1b"
      stroke="#1b1b1b"
      strokeWidth="0.8"
    />
    {state !== 'empty' && (
      <path
        d={
          state === 'full'
            ? 'M1 2h2v1h1v1h1V3h1V2h2v3H7v1H6v1H5v1H4V7H3V6H2V5H1V2z'
            : 'M1 2h2v1h1v1h1v3H4V7H3V6H2V5H1V2z'
        }
        fill="#e52521"
      />
    )}
    {state !== 'empty' && <rect x="2" y="2" width="1" height="1" fill="#ff8f8c" />}
  </svg>
);

const PixelHunger: React.FC<{ state: 'full' | 'half' | 'empty' }> = ({ state }) => (
  <svg width="14" height="14" viewBox="0 0 9 9" className="pixelated sm:h-4 sm:w-4">
    <path
      d="M5 1h3v3H7v1H6v1H4v1H3v1H1V6h1V5h1V4h1V3h1V1z"
      fill="#1b1b1b"
      stroke="#1b1b1b"
      strokeWidth="0.7"
    />
    {state !== 'empty' && (
      <path
        d={
          state === 'full'
            ? 'M5 1h3v3H7v1H6v1H4v1H3v1H1V6h1V5h1V4h1V3h1V1z'
            : 'M5 1h3v3H7v1H6v1H4V3h1V1z'
        }
        fill="#b86b35"
      />
    )}
    {state !== 'empty' && <rect x="1" y="6" width="2" height="2" fill="#efe2c4" />}
  </svg>
);

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  itemIcons,
  onSelectSlot,
  onToggleMute,
  onToggleTouch,
  onOpenInventory,
  onPause,
}) => {
  const [slotToast, setSlotToast] = useState<string | null>(null);
  const heldItem = hud.hotbar[hud.selectedSlot];

  useEffect(() => {
    const name = heldItem ? ITEMS[heldItem.id]?.name : null;
    setSlotToast(name ?? null);
    if (!name) return;
    const t = window.setTimeout(() => setSlotToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [hud.selectedSlot, heldItem?.id]);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* Underwater tint */}
      {hud.isUnderwater && (
        <div
          className="pointer-events-none fixed inset-0"
          style={{ backgroundColor: 'rgba(18, 68, 150, 0.36)' }}
        />
      )}

      {/* Top Bar */}
      <div className="flex items-start justify-between p-2 sm:p-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 border-2 border-[#353944] bg-[#14171f]/85 px-2 py-1 text-[11px] font-bold text-[#eef2f7] tabular-nums sm:gap-2.5 sm:px-2.5 sm:text-xs">
            <span>Tag {hud.dayCount} · {getTimeLabel(hud.timeOfDay)}</span>
            <span className="text-[#697284]">|</span>
            <span className={hud.gameMode === 'creative' ? 'text-[#7ce063]' : 'text-[#f2c14e]'}>
              {hud.gameMode === 'creative' ? 'Kreativ' : 'Überleben'}
            </span>
            {hud.isFlying && (
              <>
                <span className="text-[#697284]">|</span>
                <span className="text-[#72d5ff]">Fliegen</span>
              </>
            )}
          </div>

          {hud.showDebug && (
            <div className="border-2 border-[#353944] bg-[#111319]/85 px-2.5 py-1.5 text-[11px] leading-relaxed text-[#cfd6e2] tabular-nums">
              <div>
                XYZ: {hud.coords.x} / {hud.coords.y} / {hud.coords.z}
              </div>
              <div>Seed: {hud.seed}</div>
              <div>Ziel: {hud.targetedBlockName ?? '—'}</div>
            </div>
          )}
        </div>

        {/* Top-right compact buttons */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onToggleTouch}
            title="Touch-Steuerung umschalten"
            className={`flex h-9 w-9 items-center justify-center ${
              hud.touchControls ? 'mc-btn-green' : 'mc-btn'
            }`}
          >
            <Smartphone className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            title="Ton umschalten (V)"
            className="mc-btn flex h-9 w-9 items-center justify-center"
          >
            {hud.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onPause}
            title="Menü (Esc)"
            className="mc-btn flex h-9 items-center gap-1.5 px-2.5 text-xs font-bold"
          >
            <Pause className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Menü</span>
          </button>
        </div>
      </div>

      {/* Center Crosshair */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="relative h-5 w-5">
          <div className="absolute top-1/2 left-0 h-[2px] w-full -translate-y-1/2 bg-white/90 shadow-[0_0_2px_rgba(0,0,0,0.9)]" />
          <div className="absolute top-0 left-1/2 h-full w-[2px] -translate-x-1/2 bg-white/90 shadow-[0_0_2px_rgba(0,0,0,0.9)]" />
        </div>
        {hud.targetedBlockName && hud.showDebug && (
          <div className="mt-10 bg-[#14171f]/80 px-2 py-0.5 text-[11px] font-bold text-white">
            {hud.targetedBlockName}
          </div>
        )}
      </div>

      {/* Bottom Hotbar + Survival Bars */}
      <div className="mb-2 flex flex-col items-center sm:mb-3">
        {/* Held item label toast */}
        <div className="mb-1 h-4 text-[11px] font-bold text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.9)] sm:mb-1.5 sm:h-5 sm:text-xs">
          {slotToast ?? ''}
        </div>

        {hud.gameMode === 'survival' && (
          <div className="mb-1 flex w-[328px] max-w-[96vw] flex-col gap-1 sm:mb-1.5 sm:w-[446px]">
            {/* Health & Hunger Row */}
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 10 }).map((_, i) => {
                  const val = hud.health - i * 2;
                  const state = val >= 2 ? 'full' : val === 1 ? 'half' : 'empty';
                  return <PixelHeart key={i} state={state} />;
                })}
              </div>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 10 }).map((_, i) => {
                  const idx = 9 - i;
                  const val = hud.hunger - idx * 2;
                  const state = val >= 2 ? 'full' : val === 1 ? 'half' : 'empty';
                  return <PixelHunger key={i} state={state} />;
                })}
              </div>
            </div>

            {/* XP Progress Bar */}
            <div className="relative h-1.5 w-full border border-[#141414] bg-[#242824] sm:h-2">
              <div
                className="h-full bg-[#6fe038]"
                style={{ width: `${Math.round(hud.xpProgress * 100)}%` }}
              />
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[#88ff4c] drop-shadow-[0_1px_0_#000] tabular-nums sm:-top-3 sm:text-[11px]">
                {hud.xpLevel}
              </span>
            </div>
          </div>
        )}

        {/* 9-Slot Hotbar + Inventory "..." button for touch/mobile */}
        <div className="pointer-events-auto flex max-w-[98vw] items-center gap-0.5 border-2 border-[#141414] bg-[#2a2a2a]/90 p-0.5 sm:gap-1 sm:p-1">
          {hud.hotbar.map((stack, idx) => {
            const active = idx === hud.selectedSlot;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectSlot(idx)}
                className={`relative flex h-8 w-8 items-center justify-center sm:h-11 sm:w-11 ${
                  active ? 'mc-slot-active scale-105' : 'mc-slot'
                }`}
              >
                <span className="absolute top-0 left-0.5 hidden text-[9px] font-bold text-white/60 tabular-nums sm:block">
                  {idx + 1}
                </span>
                {stack && (
                  <>
                    <img
                      src={itemIcons[stack.id]}
                      alt={ITEMS[stack.id]?.name}
                      className="pixelated h-6 w-6 object-contain sm:h-8 sm:w-8"
                      draggable={false}
                    />
                    {stack.count > 1 && hud.gameMode === 'survival' && (
                      <span className="absolute right-0.5 bottom-0 text-[9px] font-bold text-white drop-shadow-[1px_1px_0_#111] tabular-nums sm:right-1 sm:bottom-0.5 sm:text-[11px]">
                        {stack.count}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={onOpenInventory}
            title="Inventar öffnen (E)"
            className="mc-slot ml-0.5 flex h-8 w-8 items-center justify-center text-white hover:brightness-110 sm:h-11 sm:w-11"
          >
            <MoreHorizontal className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
