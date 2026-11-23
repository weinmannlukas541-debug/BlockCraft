import React from 'react';
import { GameMode, HudSnapshot } from '../game/types';

interface TitleScreenProps {
  isTouch: boolean;
  onStart: (mode: GameMode) => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ isTouch, onStart }) => {
  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-between bg-gradient-to-b from-[#0a101b]/55 via-transparent to-[#090d14]/75 px-4 py-8 sm:px-6 sm:py-10">
      {/* Top negative space with bespoke voxel title SVG */}
      <div className="mt-2 flex flex-col items-center gap-3 sm:mt-4">
        <svg
          width="460"
          height="92"
          viewBox="0 0 460 92"
          className="h-auto max-w-[90vw] drop-shadow-[0_6px_0_rgba(12,18,12,0.85)]"
          aria-label="BLOCKCRAFT"
        >
          <rect x="10" y="10" width="440" height="70" fill="#5e5e5e" stroke="#181818" strokeWidth="4" />
          <rect x="14" y="14" width="432" height="14" fill="#599d34" />
          <rect x="14" y="28" width="432" height="4" fill="#3c6e22" />
          <rect x="14" y="72" width="432" height="4" fill="#3b3b3b" />
          <text
            x="230"
            y="61"
            textAnchor="middle"
            fill="#ffffff"
            fontFamily="ui-monospace, Menlo, Consolas, monospace"
            fontWeight="900"
            fontSize="40"
            letterSpacing="6"
          >
            BLOCKCRAFT
          </text>
        </svg>
        <p className="bg-[#12161e]/80 px-3 py-1 text-center text-[11px] font-bold tracking-widest text-[#d4e2f4] uppercase sm:text-xs">
          3D Voxel Sandbox · Bauen, Abbauen &amp; Entdecken
        </p>
      </div>

      {/* Center Action Buttons */}
      <div className="flex w-full max-w-[320px] flex-col gap-3">
        <button
          type="button"
          onClick={() => onStart('survival')}
          className="mc-btn-green w-full py-3.5 text-base font-bold tracking-wide"
        >
          Überleben starten
        </button>
        <button
          type="button"
          onClick={() => onStart('creative')}
          className="mc-btn w-full py-3 text-sm font-bold tracking-wide"
        >
          Kreativmodus starten
        </button>
      </div>

      {/* Single flat control-hint line */}
      <div className="max-w-[94vw] border border-[#384050] bg-[#11151d]/85 px-3 py-2 text-center text-[11px] font-semibold text-[#d3dce8] sm:px-4 sm:text-xs">
        {isTouch
          ? 'Joystick Bewegen · Wischen Umsehen · Buttons Abbauen & Bauen · … Inventar'
          : 'WASD Bewegen · Leertaste Springen · Linksklick Abbauen · Rechtsklick Bauen · E Inventar · Esc Pause'}
      </div>
    </div>
  );
};

interface PauseModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onToggleMode: () => void;
  onToggleTouch: () => void;
  onSetTime: (t: number) => void;
  onToggleMute: () => void;
  onNewWorld: () => void;
  onTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  hud,
  onResume,
  onToggleMode,
  onToggleTouch,
  onSetTime,
  onToggleMute,
  onNewWorld,
  onTitle,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-4">
      <div className="mc-panel flex max-h-[92vh] w-full max-w-[380px] flex-col gap-2.5 overflow-y-auto p-4 text-[#1f1f1f] sm:gap-3 sm:p-5">
        <h2 className="border-b-2 border-[#7f7f7f] pb-2 text-center text-base font-black tracking-wider uppercase">
          Spiel pausiert
        </h2>

        <button type="button" onClick={onResume} className="mc-btn-green w-full py-2.5 text-sm font-bold">
          Weiterspielen
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onToggleMode} className="mc-btn py-2 text-xs font-bold">
            Modus: {hud.gameMode === 'survival' ? 'Überleben' : 'Kreativ'}
          </button>
          <button type="button" onClick={onToggleMute} className="mc-btn py-2 text-xs font-bold">
            Ton: {hud.muted ? 'Aus' : 'Ein'}
          </button>
        </div>

        <button type="button" onClick={onToggleTouch} className="mc-btn w-full py-2 text-xs font-bold">
          Steuerung: {hud.touchControls ? 'Touchscreen (Handy/Tablet)' : 'Maus & Tastatur'}
        </button>

        {/* Time of Day Presets */}
        <div className="flex flex-col gap-1 border-2 border-[#7c7c7c] bg-[#b0b0b0] p-2">
          <span className="text-[11px] font-bold uppercase text-[#2f2f2f]">Tageszeit setzen</span>
          <div className="grid grid-cols-4 gap-1.5">
            <button type="button" onClick={() => onSetTime(0.04)} className="mc-btn py-1.5 text-[11px] font-bold">
              Morgen
            </button>
            <button type="button" onClick={() => onSetTime(0.25)} className="mc-btn py-1.5 text-[11px] font-bold">
              Mittag
            </button>
            <button type="button" onClick={() => onSetTime(0.49)} className="mc-btn py-1.5 text-[11px] font-bold">
              Abend
            </button>
            <button type="button" onClick={() => onSetTime(0.75)} className="mc-btn py-1.5 text-[11px] font-bold">
              Nacht
            </button>
          </div>
        </div>

        <button type="button" onClick={onNewWorld} className="mc-btn w-full py-2 text-xs font-bold">
          Neue Welt generieren
        </button>

        <button type="button" onClick={onTitle} className="mc-btn w-full py-2 text-xs font-bold">
          Zurück zum Titelbildschirm
        </button>

        <p className="pt-1 text-center text-[11px] font-semibold text-[#424242]">
          Tipp: Werkbank antippen/Rechtsklick für 3×3 Crafting
        </p>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  onRespawn: () => void;
  onTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({ onRespawn, onTitle }) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#5a1010]/70 p-4">
      <div className="mc-panel flex w-full max-w-[340px] flex-col gap-3 p-5 text-center">
        <h2 className="text-xl font-black tracking-wide text-[#9e1a1a] uppercase">
          Du bist gestorben!
        </h2>
        <p className="text-xs font-semibold text-[#3a3a3a]">
          Deine Abenteuer in dieser Blockwelt gehen weiter.
        </p>
        <button type="button" onClick={onRespawn} className="mc-btn-green w-full py-2.5 text-sm font-bold">
          Wiederbeleben
        </button>
        <button type="button" onClick={onTitle} className="mc-btn w-full py-2 text-xs font-bold">
          Hauptmenü
        </button>
      </div>
    </div>
  );
};
