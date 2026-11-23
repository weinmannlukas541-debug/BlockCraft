import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  FolderOpen,
  Gamepad2,
  Maximize2,
  Minimize2,
  Plus,
  Save,
  Settings,
  Trash2,
} from 'lucide-react';
import { formatModeLabel } from '../game/storage';
import { GameMode, GameSettings, HudSnapshot, WeatherType, WorldSaveMeta } from '../game/types';

interface TitleScreenProps {
  hud: HudSnapshot;
  onStart: (mode: GameMode) => void;
  onListWorlds: () => Promise<WorldSaveMeta[]>;
  onCreateWorld: (opts: {
    name: string;
    seed?: number;
    mode: GameMode;
    keepInventory: boolean;
  }) => Promise<void>;
  onLoadWorld: (id: string) => Promise<boolean>;
  onDeleteWorld: (id: string) => Promise<void>;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onToggleFullscreen: () => void;
}

type TitleTab = 'main' | 'worlds' | 'create' | 'settings' | 'controls';

const ALL_MODES: GameMode[] = ['survival', 'creative', 'adventure', 'spectator'];

export const TitleScreen: React.FC<TitleScreenProps> = ({
  hud,
  onStart,
  onListWorlds,
  onCreateWorld,
  onLoadWorld,
  onDeleteWorld,
  onUpdateSettings,
  onToggleFullscreen,
}) => {
  const [tab, setTab] = useState<TitleTab>('main');
  const [worlds, setWorlds] = useState<WorldSaveMeta[]>([]);
  const [loadingWorlds, setLoadingWorlds] = useState(false);

  // Create World Form State
  const [newName, setNewName] = useState('Meine Abenteuerwelt');
  const [newSeed, setNewSeed] = useState('');
  const [newMode, setNewMode] = useState<GameMode>('survival');
  const [newKeepInv, setNewKeepInv] = useState(false);

  const refreshWorlds = async () => {
    setLoadingWorlds(true);
    const list = await onListWorlds();
    setWorlds(list);
    setLoadingWorlds(false);
  };

  useEffect(() => {
    if (tab === 'worlds') {
      void refreshWorlds();
    }
  }, [tab]);

  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-between bg-gradient-to-b from-[#0a101b]/55 via-transparent to-[#090d14]/80 px-3 py-5 sm:px-6 sm:py-8">
      {/* Top-right Fullscreen button for mobile/tablet players */}
      <button
        type="button"
        onClick={onToggleFullscreen}
        title={hud.isFullscreen ? 'Vollbild beenden' : 'Vollbild aktivieren'}
        className={`fixed top-3 right-3 z-30 flex h-9 items-center gap-1.5 px-2.5 text-xs font-bold ${
          hud.isFullscreen ? 'mc-btn-green' : 'mc-btn'
        }`}
      >
        {hud.isFullscreen ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
        <span>{hud.isFullscreen ? 'Vollbild Aus' : 'Vollbild'}</span>
      </button>

      {/* Top Logo */}
      <div className="mt-4 flex flex-col items-center gap-2 sm:mt-2">
        <svg
          width="480"
          height="92"
          viewBox="0 0 480 92"
          className="h-auto max-w-[88vw] drop-shadow-[0_6px_0_rgba(12,18,12,0.85)]"
          aria-label="NEXORA CRAFT"
        >
          <rect x="8" y="10" width="464" height="70" fill="#5e5e5e" stroke="#181818" strokeWidth="4" />
          <rect x="12" y="14" width="456" height="14" fill="#599d34" />
          <rect x="12" y="28" width="456" height="4" fill="#3c6e22" />
          <rect x="12" y="72" width="456" height="4" fill="#3b3b3b" />
          <text
            x="240"
            y="60"
            textAnchor="middle"
            fill="#ffffff"
            fontFamily="ui-monospace, Menlo, Consolas, monospace"
            fontWeight="900"
            fontSize="36"
            letterSpacing="4"
          >
            NEXORA CRAFT
          </text>
        </svg>
        <p className="bg-[#12161e]/80 px-3 py-1 text-center text-[10px] font-bold tracking-widest text-[#d4e2f4] uppercase sm:text-xs">
          Next-Gen 3D Voxel Sandbox · Biome, Wetter, Crafting &amp; Mobs
        </p>
      </div>

      {/* Main Content Area */}
      {tab === 'main' && (
        <div className="flex w-full max-w-[340px] flex-col gap-2.5">
          <button
            type="button"
            onClick={() => onStart('survival')}
            className="mc-btn-green w-full py-3 text-base font-bold tracking-wide"
          >
            Schnellstart: Überleben
          </button>
          <button
            type="button"
            onClick={() => setTab('worlds')}
            className="mc-btn flex w-full items-center justify-center gap-2 py-2.5 text-sm font-bold"
          >
            <FolderOpen className="h-4 w-4" />
            <span>Einzelspieler / Welten</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('create')}
            className="mc-btn flex w-full items-center justify-center gap-2 py-2.5 text-sm font-bold"
          >
            <Plus className="h-4 w-4" />
            <span>Neue Welt erstellen</span>
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setTab('settings')}
              className="mc-btn flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold sm:text-sm"
            >
              <Settings className="h-4 w-4" />
              <span>Einstellungen</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('controls')}
              className="mc-btn flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold sm:text-sm"
            >
              <Gamepad2 className="h-4 w-4" />
              <span>Steuerung</span>
            </button>
          </div>
        </div>
      )}

      {tab === 'worlds' && (
        <div className="mc-panel flex max-h-[64vh] w-full max-w-[460px] flex-col gap-2.5 p-4 text-[#1f1f1f]">
          <div className="flex items-center justify-between border-b-2 border-[#7f7f7f] pb-2">
            <h2 className="text-sm font-black uppercase">Gespeicherte Welten</h2>
            <button
              type="button"
              onClick={() => setTab('main')}
              className="mc-btn flex items-center gap-1 px-2.5 py-1 text-xs font-bold"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zurück
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {loadingWorlds ? (
              <p className="py-6 text-center text-xs font-bold text-[#444]">Lade Welten...</p>
            ) : worlds.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-[#444]">
                <p className="font-bold">Noch keine gespeicherten Welten vorhanden.</p>
                <button
                  type="button"
                  onClick={() => setTab('create')}
                  className="mc-btn-green px-4 py-2 text-xs font-bold"
                >
                  Erste Welt erstellen
                </button>
              </div>
            ) : (
              worlds.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between gap-2 border-2 border-[#7b7b7b] bg-[#b5b5b5] p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black">{w.name}</div>
                    <div className="text-[11px] font-semibold text-[#3b3b3b]">
                      {formatModeLabel(w.gameMode)} · Tag {w.dayCount} · Seed {w.seed}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void onLoadWorld(w.id)}
                      className="mc-btn-green px-3 py-1.5 text-xs font-bold"
                    >
                      Spielen
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void onDeleteWorld(w.id).then(refreshWorlds);
                      }}
                      title="Welt löschen"
                      className="mc-btn flex h-8 w-8 items-center justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'create' && (
        <div className="mc-panel flex max-h-[68vh] w-full max-w-[440px] flex-col gap-3 overflow-y-auto p-4 text-[#1f1f1f]">
          <div className="flex items-center justify-between border-b-2 border-[#7f7f7f] pb-2">
            <h2 className="text-sm font-black uppercase">Neue Welt erstellen</h2>
            <button
              type="button"
              onClick={() => setTab('main')}
              className="mc-btn flex items-center gap-1 px-2.5 py-1 text-xs font-bold"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zurück
            </button>
          </div>

          <label className="flex flex-col gap-1 text-xs font-bold">
            <span>Weltname</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={32}
              className="border-2 border-[#555] bg-[#efefef] px-2.5 py-1.5 text-sm font-bold text-[#111] outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-bold">
            <span>Seed (optional, Zahl)</span>
            <input
              type="text"
              value={newSeed}
              onChange={(e) => setNewSeed(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Zufällig"
              className="border-2 border-[#555] bg-[#efefef] px-2.5 py-1.5 text-sm font-bold text-[#111] outline-none"
            />
          </label>

          <div className="flex flex-col gap-1 text-xs font-bold">
            <span>Spielmodus</span>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setNewMode(m)}
                  className={`py-2 text-xs font-bold ${
                    newMode === m ? 'mc-btn-green' : 'mc-btn'
                  }`}
                >
                  {formatModeLabel(m)}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setNewKeepInv((v) => !v)}
            className={`py-2 text-xs font-bold ${newKeepInv ? 'mc-btn-green' : 'mc-btn'}`}
          >
            Inventar bei Tod behalten: {newKeepInv ? 'An' : 'Aus'}
          </button>

          <button
            type="button"
            onClick={() =>
              void onCreateWorld({
                name: newName,
                seed: newSeed ? Number(newSeed) : undefined,
                mode: newMode,
                keepInventory: newKeepInv,
              })
            }
            className="mc-btn-green py-3 text-sm font-bold uppercase"
          >
            Welt generieren &amp; starten
          </button>
        </div>
      )}

      {tab === 'settings' && (
        <div className="mc-panel flex max-h-[68vh] w-full max-w-[440px] flex-col gap-2.5 overflow-y-auto p-4 text-[#1f1f1f]">
          <div className="flex items-center justify-between border-b-2 border-[#7f7f7f] pb-2">
            <h2 className="text-sm font-black uppercase">Einstellungen</h2>
            <button
              type="button"
              onClick={() => setTab('main')}
              className="mc-btn flex items-center gap-1 px-2.5 py-1 text-xs font-bold"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zurück
            </button>
          </div>

          <div className="flex flex-col gap-1 text-xs font-bold">
            <div className="flex justify-between">
              <span>Sichtweite (Chunks)</span>
              <span>{hud.settings.renderDistance}</span>
            </div>
            <input
              type="range"
              min={2}
              max={5}
              step={1}
              value={hud.settings.renderDistance}
              onChange={(e) => onUpdateSettings({ renderDistance: Number(e.target.value) })}
            />
          </div>

          <div className="flex flex-col gap-1 text-xs font-bold">
            <div className="flex justify-between">
              <span>Sichtfeld (FOV)</span>
              <span>{hud.settings.fov}°</span>
            </div>
            <input
              type="range"
              min={65}
              max={95}
              step={1}
              value={hud.settings.fov}
              onChange={(e) => onUpdateSettings({ fov: Number(e.target.value) })}
            />
          </div>

          <div className="flex flex-col gap-1 text-xs font-bold">
            <div className="flex justify-between">
              <span>Kamera-Empfindlichkeit</span>
              <span>{hud.settings.sensitivity.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={hud.settings.sensitivity}
              onChange={(e) => onUpdateSettings({ sensitivity: Number(e.target.value) })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onUpdateSettings({ shadows: !hud.settings.shadows })}
              className={`py-2 text-xs font-bold ${
                hud.settings.shadows ? 'mc-btn-green' : 'mc-btn'
              }`}
            >
              Schatten: {hud.settings.shadows ? 'An' : 'Aus'}
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ weatherParticles: !hud.settings.weatherParticles })}
              className={`py-2 text-xs font-bold ${
                hud.settings.weatherParticles ? 'mc-btn-green' : 'mc-btn'
              }`}
            >
              Wetter-Effekte: {hud.settings.weatherParticles ? 'An' : 'Aus'}
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ showFps: !hud.settings.showFps })}
              className={`py-2 text-xs font-bold ${
                hud.settings.showFps ? 'mc-btn-green' : 'mc-btn'
              }`}
            >
              FPS-Anzeige: {hud.settings.showFps ? 'An' : 'Aus'}
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ muted: !hud.settings.muted })}
              className={`py-2 text-xs font-bold ${!hud.settings.muted ? 'mc-btn-green' : 'mc-btn'}`}
            >
              Ton: {hud.settings.muted ? 'Aus' : 'Ein'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => onUpdateSettings({ touchControls: !hud.settings.touchControls })}
            className={`py-2 text-xs font-bold ${
              hud.settings.touchControls ? 'mc-btn-green' : 'mc-btn'
            }`}
          >
            Touch-Steuerung (Handy/Tablet): {hud.settings.touchControls ? 'An' : 'Aus'}
          </button>
        </div>
      )}

      {tab === 'controls' && (
        <div className="mc-panel flex max-h-[68vh] w-full max-w-[460px] flex-col gap-2 overflow-y-auto p-4 text-[#1f1f1f]">
          <div className="flex items-center justify-between border-b-2 border-[#7f7f7f] pb-2">
            <h2 className="text-sm font-black uppercase">Steuerungs-Übersicht</h2>
            <button
              type="button"
              onClick={() => setTab('main')}
              className="mc-btn flex items-center gap-1 px-2.5 py-1 text-xs font-bold"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zurück
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1.5 text-xs font-semibold sm:grid-cols-2">
            <div>• WASD: Bewegen</div>
            <div>• Maus / Wischen: Kamera</div>
            <div>• Leertaste: Springen / Fliegen</div>
            <div>• Shift: Schleichen / Sinken</div>
            <div>• Strg / R: Sprinten</div>
            <div>• Linksklick / Halten: Abbau &amp; Kampf</div>
            <div>• Rechtsklick: Bauen / Nutzen / Bogen</div>
            <div>• E: Inventar &amp; Rüstung</div>
            <div>• Q: Ausgewähltes Item droppen</div>
            <div>• 1–9 / Mausrad: Hotbar</div>
            <div>• F3 / H: Debug-Anzeige</div>
            <div>• Vollbild-Button: Handy/Tablet-Modus</div>
          </div>
        </div>
      )}

      {/* Flat bottom control summary */}
      <div className="max-w-[94vw] border border-[#384050] bg-[#11151d]/85 px-3 py-1.5 text-center text-[11px] font-semibold text-[#d3dce8] sm:px-4 sm:text-xs">
        {hud.settings.touchControls
          ? 'Touch-Joystick · Wischen Umsehen · Vollbild oben rechts · Buttons Abbau/Bauen/Schild'
          : 'WASD Bewegen · Leertaste Springen · Linksklick Abbau · Rechtsklick Bauen/Nutzen · E Inventar · Q Drop'}
      </div>
    </div>
  );
};

interface PauseModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onSaveWorld: () => void;
  onSetMode: (mode: GameMode) => void;
  onToggleTouch: () => void;
  onToggleFullscreen: () => void;
  onSetTime: (t: number) => void;
  onSetWeather: (w: WeatherType) => void;
  onToggleMute: () => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onNewWorld: () => void;
  onTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  hud,
  onResume,
  onSaveWorld,
  onSetMode,
  onToggleTouch,
  onToggleFullscreen,
  onSetTime,
  onSetWeather,
  onToggleMute,
  onUpdateSettings,
  onNewWorld,
  onTitle,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-3">
      <div className="mc-panel flex max-h-[92vh] w-full max-w-[420px] flex-col gap-2.5 overflow-y-auto p-4 text-[#1f1f1f]">
        <h2 className="border-b-2 border-[#7f7f7f] pb-2 text-center text-base font-black tracking-wider uppercase">
          {hud.worldName} · Pausiert
        </h2>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onResume} className="mc-btn-green py-2.5 text-sm font-bold">
            Weiterspielen
          </button>
          <button
            type="button"
            onClick={onSaveWorld}
            className="mc-btn flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold"
          >
            <Save className="h-4 w-4" />
            <span>Speichern</span>
          </button>
        </div>

        {/* 4 Game Modes */}
        <div className="flex flex-col gap-1 border-2 border-[#7c7c7c] bg-[#b0b0b0] p-2">
          <span className="text-[11px] font-bold uppercase text-[#2f2f2f]">Spielmodus</span>
          <div className="grid grid-cols-4 gap-1">
            {ALL_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onSetMode(m)}
                className={`py-1.5 text-[10px] font-bold sm:text-[11px] ${
                  hud.gameMode === m ? 'mc-btn-green' : 'mc-btn'
                }`}
              >
                {formatModeLabel(m)}
              </button>
            ))}
          </div>
        </div>

        {/* Time & Weather */}
        <div className="flex flex-col gap-1.5 border-2 border-[#7c7c7c] bg-[#b0b0b0] p-2">
          <span className="text-[11px] font-bold uppercase text-[#2f2f2f]">Tageszeit &amp; Wetter</span>
          <div className="grid grid-cols-4 gap-1">
            <button type="button" onClick={() => onSetTime(0.04)} className="mc-btn py-1 text-[11px] font-bold">
              Morgen
            </button>
            <button type="button" onClick={() => onSetTime(0.25)} className="mc-btn py-1 text-[11px] font-bold">
              Mittag
            </button>
            <button type="button" onClick={() => onSetTime(0.49)} className="mc-btn py-1 text-[11px] font-bold">
              Abend
            </button>
            <button type="button" onClick={() => onSetTime(0.75)} className="mc-btn py-1 text-[11px] font-bold">
              Nacht
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                ['clear', 'Klar'],
                ['rain', 'Regen'],
                ['snow', 'Schnee'],
                ['storm', 'Sturm'],
              ] as [WeatherType, string][]
            ).map(([w, label]) => (
              <button
                key={w}
                type="button"
                onClick={() => onSetWeather(w)}
                className={`py-1 text-[11px] font-bold ${
                  hud.weather === w ? 'mc-btn-green' : 'mc-btn'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Graphics & Controls */}
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onToggleFullscreen} className="mc-btn py-2 text-xs font-bold">
            Vollbild: {hud.isFullscreen ? 'An' : 'Aus'}
          </button>
          <button type="button" onClick={onToggleMute} className="mc-btn py-2 text-xs font-bold">
            Ton: {hud.settings.muted ? 'Aus' : 'Ein'}
          </button>
          <button type="button" onClick={onToggleTouch} className="mc-btn py-2 text-xs font-bold">
            Touch: {hud.settings.touchControls ? 'An' : 'Aus'}
          </button>
          <button
            type="button"
            onClick={() => onUpdateSettings({ shadows: !hud.settings.shadows })}
            className="mc-btn py-2 text-xs font-bold"
          >
            Schatten: {hud.settings.shadows ? 'An' : 'Aus'}
          </button>
        </div>

        <button type="button" onClick={onNewWorld} className="mc-btn w-full py-2 text-xs font-bold">
          Neue Welt generieren
        </button>

        <button type="button" onClick={onTitle} className="mc-btn w-full py-2 text-xs font-bold">
          Speichern &amp; zum Hauptmenü
        </button>

        <p className="pt-0.5 text-center text-[10px] font-semibold text-[#424242]">
          Rechtsklick/Bauen auf Werkbank, Ofen, Truhe oder Bett zum Benutzen
        </p>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  keepInventory: boolean;
  onRespawn: () => void;
  onTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  keepInventory,
  onRespawn,
  onTitle,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#5a1010]/70 p-4">
      <div className="mc-panel flex w-full max-w-[340px] flex-col gap-3 p-5 text-center">
        <h2 className="text-xl font-black tracking-wide text-[#9e1a1a] uppercase">
          Du bist gestorben!
        </h2>
        <p className="text-xs font-semibold text-[#3a3a3a]">
          {keepInventory
            ? 'Dein Inventar bleibt dank Welteinstellung erhalten.'
            : 'Deine Items wurden am Todesort fallen gelassen.'}
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
