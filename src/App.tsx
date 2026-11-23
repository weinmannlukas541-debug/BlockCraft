/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { InventoryModal } from './components/InventoryModal';
import { GameOverModal, PauseModal, TitleScreen } from './components/TitleAndPauseModals';
import { TouchControls } from './components/TouchControls';
import { VoxelEngine } from './game/engine';
import { HudSnapshot } from './game/types';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VoxelEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [itemIcons, setItemIcons] = useState<Record<number, string>>({});

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new VoxelEngine(mount, (snap) => {
      setHud(snap);
    });
    engineRef.current = engine;
    setItemIcons(engine.getItemIcons());

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const engine = engineRef.current;

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#111318]">
      {/* Isolated WebGL canvas container */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />

      {hud?.screen === 'title' && (
        <TitleScreen
          isTouch={hud.touchControls}
          onStart={(mode) => engine?.startGame(mode)}
        />
      )}

      {hud && hud.screen === 'playing' && (
        <>
          <GameHud
            hud={hud}
            itemIcons={itemIcons}
            onSelectSlot={(idx) => engine?.selectHotbarSlot(idx)}
            onToggleMute={() => engine?.toggleMute()}
            onToggleTouch={() => engine?.toggleTouchControls()}
            onOpenInventory={() => engine?.openScreen('inventory')}
            onPause={() => engine?.openScreen('paused')}
          />

          {hud.touchControls && (
            <TouchControls
              isFlying={hud.isFlying}
              onMove={(x, y) => engine?.setTouchMove(x, y)}
              onJump={(held) => engine?.setTouchJump(held)}
              onDescend={(held) => engine?.setTouchDescend(held)}
              onToggleSneak={() => engine?.toggleTouchSneak()}
              onMine={(held) => engine?.setTouchMine(held)}
              onPlace={() => engine?.triggerTouchPlace()}
            />
          )}
        </>
      )}

      {hud && (hud.screen === 'inventory' || hud.screen === 'crafting') && (
        <InventoryModal
          hud={hud}
          isTable={hud.screen === 'crafting'}
          itemIcons={itemIcons}
          onClose={() => engine?.resumeGame()}
          onSetSlot={(area, idx, stack) => engine?.setSlotItem(area, idx, stack)}
          onGiveCreative={(itemId) => engine?.giveCreativeItem(itemId)}
        />
      )}

      {hud?.screen === 'paused' && (
        <PauseModal
          hud={hud}
          onResume={() => engine?.resumeGame()}
          onToggleMode={() =>
            engine?.setGameMode(hud.gameMode === 'survival' ? 'creative' : 'survival')
          }
          onToggleTouch={() => engine?.toggleTouchControls()}
          onSetTime={(t) => engine?.setTimePreset(t)}
          onToggleMute={() => engine?.toggleMute()}
          onNewWorld={() => engine?.regenerateWorld()}
          onTitle={() => engine?.openScreen('title')}
        />
      )}

      {hud?.screen === 'gameover' && (
        <GameOverModal
          onRespawn={() => engine?.respawnPlayer()}
          onTitle={() => engine?.openScreen('title')}
        />
      )}
    </div>
  );
}
