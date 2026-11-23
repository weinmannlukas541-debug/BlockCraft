/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { ChestModal, FurnaceModal } from './components/ContainerModals';
import { GameHud } from './components/GameHud';
import { InventoryModal } from './components/InventoryModal';
import { GameOverModal, PauseModal, TitleScreen } from './components/TitleAndPauseModals';
import { TouchControls } from './components/TouchControls';
import { VoxelEngine } from './game/engine';
import { HudSnapshot, ItemId } from './game/types';

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
  const heldItem = hud ? hud.hotbar[hud.selectedSlot] : null;
  const hasShield = Boolean(hud?.offhand?.id === ItemId.Shield || heldItem?.id === ItemId.Shield);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#111318]">
      {/* Isolated WebGL canvas container */}
      <div ref={canvasMountRef} className="absolute inset-0 h-full w-full" />

      {hud?.screen === 'title' && (
        <TitleScreen
          hud={hud}
          onStart={(mode) => engine?.startGame(mode)}
          onListWorlds={() => engine?.getWorldList() ?? Promise.resolve([])}
          onCreateWorld={(opts) => engine?.createNewWorld(opts) ?? Promise.resolve()}
          onLoadWorld={(id) => engine?.loadWorldById(id) ?? Promise.resolve(false)}
          onDeleteWorld={(id) => engine?.deleteWorldById(id) ?? Promise.resolve()}
          onUpdateSettings={(partial) => engine?.updateSettings(partial)}
          onToggleFullscreen={() => engine?.toggleFullscreen()}
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
            onToggleFullscreen={() => engine?.toggleFullscreen()}
            onOpenInventory={() => engine?.openScreen('inventory')}
            onPause={() => engine?.openScreen('paused')}
          />

          {hud.settings.touchControls && (
            <TouchControls
              isFlying={hud.isFlying}
              hasShield={hasShield}
              onMove={(x, y) => engine?.setTouchMove(x, y)}
              onJump={(held) => engine?.setTouchJump(held)}
              onDescend={(held) => engine?.setTouchDescend(held)}
              onToggleSneak={() => engine?.toggleTouchSneak()}
              onMine={(held) => engine?.setTouchMine(held)}
              onPlace={() => engine?.triggerTouchPlace()}
              onBlock={(held) => engine?.setTouchBlock(held)}
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
          onDropStack={(stack) => engine?.dropStackFromUi(stack)}
        />
      )}

      {hud && hud.screen === 'furnace' && (
        <FurnaceModal
          hud={hud}
          itemIcons={itemIcons}
          onClose={() => engine?.resumeGame()}
          onSetSlot={(area, idx, stack) => engine?.setSlotItem(area, idx, stack)}
          onSetFurnaceSlot={(slot, stack) => engine?.setFurnaceSlot(slot, stack)}
          onDropStack={(stack) => engine?.dropStackFromUi(stack)}
        />
      )}

      {hud && hud.screen === 'chest' && (
        <ChestModal
          hud={hud}
          itemIcons={itemIcons}
          onClose={() => engine?.resumeGame()}
          onSetSlot={(area, idx, stack) => engine?.setSlotItem(area, idx, stack)}
          onSetChestSlot={(idx, stack) => engine?.setChestSlot(idx, stack)}
          onDropStack={(stack) => engine?.dropStackFromUi(stack)}
        />
      )}

      {hud?.screen === 'paused' && (
        <PauseModal
          hud={hud}
          onResume={() => engine?.resumeGame()}
          onSaveWorld={() => void engine?.saveCurrentWorld(true)}
          onSetMode={(m) => engine?.setGameMode(m)}
          onToggleTouch={() => engine?.toggleTouchControls()}
          onToggleFullscreen={() => engine?.toggleFullscreen()}
          onSetTime={(t) => engine?.setTimePreset(t)}
          onSetWeather={(w) => engine?.setWeather(w)}
          onToggleMute={() => engine?.toggleMute()}
          onUpdateSettings={(partial) => engine?.updateSettings(partial)}
          onNewWorld={() => engine?.regenerateWorld()}
          onTitle={() => engine?.openScreen('title')}
        />
      )}

      {hud?.screen === 'gameover' && (
        <GameOverModal
          keepInventory={hud.keepInventory}
          onRespawn={() => engine?.respawnPlayer()}
          onTitle={() => engine?.openScreen('title')}
        />
      )}
    </div>
  );
}
