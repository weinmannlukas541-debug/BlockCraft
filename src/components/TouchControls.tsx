import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Hammer, Pickaxe, Shield } from 'lucide-react';

interface TouchControlsProps {
  isFlying: boolean;
  hasShield: boolean;
  onMove: (x: number, y: number) => void;
  onJump: (held: boolean) => void;
  onDescend: (held: boolean) => void;
  onToggleSneak: () => void;
  onMine: (held: boolean) => void;
  onPlace: () => void;
  onBlock: (held: boolean) => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  isFlying,
  hasShield,
  onMove,
  onJump,
  onDescend,
  onToggleSneak,
  onMine,
  onPlace,
  onBlock,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const stickPointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [sneakingUi, setSneakingUi] = useState(false);

  const maxRadius = 38;

  const updateStick = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobOffset({ x: dx, y: dy });
    onMove(dx / maxRadius, -dy / maxRadius);
  };

  const resetStick = () => {
    stickPointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-20 flex items-end justify-between px-3 sm:bottom-24 sm:px-6">
      {/* Left: Virtual Thumbstick + Sneak */}
      <div className="pointer-events-auto flex flex-col items-center gap-2">
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (isFlying) {
              onDescend(true);
            } else {
              setSneakingUi((prev) => !prev);
              onToggleSneak();
            }
          }}
          onPointerUp={() => {
            if (isFlying) onDescend(false);
          }}
          onPointerCancel={() => {
            if (isFlying) onDescend(false);
          }}
          className={`flex h-9 items-center gap-1 px-2.5 text-[11px] font-bold ${
            sneakingUi && !isFlying ? 'mc-btn-green' : 'mc-btn'
          }`}
        >
          {isFlying ? (
            <>
              <ArrowDown className="h-3.5 w-3.5" />
              <span>Sinken</span>
            </>
          ) : (
            <span>{sneakingUi ? 'Schleichen: An' : 'Schleichen'}</span>
          )}
        </button>

        <div
          ref={padRef}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (stickPointerId.current !== null) return;
            stickPointerId.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateStick(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (stickPointerId.current !== e.pointerId) return;
            updateStick(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            if (stickPointerId.current === e.pointerId) resetStick();
          }}
          onPointerCancel={(e) => {
            if (stickPointerId.current === e.pointerId) resetStick();
          }}
          className="relative flex h-28 w-28 touch-none items-center justify-center border-2 border-white/30 bg-[#14171f]/55 sm:h-32 sm:w-32"
        >
          <div className="pointer-events-none absolute h-full w-[1px] bg-white/15" />
          <div className="pointer-events-none absolute h-[1px] w-full bg-white/15" />
          <div
            className="mc-slot pointer-events-none h-11 w-11"
            style={{
              transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            }}
          />
        </div>
      </div>

      {/* Right: Action Buttons (Shield, Mine, Place, Jump) */}
      <div className="pointer-events-auto flex items-end gap-2">
        {hasShield && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              onBlock(true);
            }}
            onPointerUp={() => onBlock(false)}
            onPointerCancel={() => onBlock(false)}
            className="mc-btn flex h-13 w-13 flex-col items-center justify-center gap-0.5 text-[10px] font-bold sm:h-14 sm:w-16 sm:text-xs"
          >
            <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Schild</span>
          </button>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              onMine(true);
            }}
            onPointerUp={() => onMine(false)}
            onPointerCancel={() => onMine(false)}
            className="mc-btn flex h-13 w-16 flex-col items-center justify-center gap-0.5 text-[10px] font-bold sm:h-14 sm:w-20 sm:text-xs"
          >
            <Pickaxe className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Abbau</span>
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onPlace();
            }}
            className="mc-btn-green flex h-13 w-16 flex-col items-center justify-center gap-0.5 text-[10px] font-bold sm:h-14 sm:w-20 sm:text-xs"
          >
            <Hammer className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Bauen</span>
          </button>
        </div>

        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            onJump(true);
          }}
          onPointerUp={() => onJump(false)}
          onPointerCancel={() => onJump(false)}
          className="mc-btn flex h-16 w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold sm:h-20 sm:w-16 sm:text-xs"
        >
          <ArrowUp className="h-5 w-5 sm:h-6 sm:w-6" />
          <span>{isFlying ? 'Hoch' : 'Sprung'}</span>
        </button>
      </div>
    </div>
  );
};
