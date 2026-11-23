import React, { useState } from 'react';
import { Flame, Package, Trash2, X } from 'lucide-react';
import { ITEMS, SMELT_RECIPES } from '../game/blocks';
import { HudSnapshot, ItemStack } from '../game/types';

interface FurnaceModalProps {
  hud: HudSnapshot;
  itemIcons: Record<number, string>;
  onClose: () => void;
  onSetSlot: (area: 'hotbar' | 'inventory', idx: number, stack: ItemStack | null) => void;
  onSetFurnaceSlot: (slot: 'input' | 'fuel' | 'output', stack: ItemStack | null) => void;
  onDropStack: (stack: ItemStack) => void;
}

interface ChestModalProps {
  hud: HudSnapshot;
  itemIcons: Record<number, string>;
  onClose: () => void;
  onSetSlot: (area: 'hotbar' | 'inventory', idx: number, stack: ItemStack | null) => void;
  onSetChestSlot: (idx: number, stack: ItemStack | null) => void;
  onDropStack: (stack: ItemStack) => void;
}

const SlotContent: React.FC<{ stack: ItemStack; itemIcons: Record<number, string> }> = ({
  stack,
  itemIcons,
}) => {
  const maxDur = ITEMS[stack.id]?.maxDurability;
  return (
    <>
      <img
        src={itemIcons[stack.id]}
        alt={ITEMS[stack.id]?.name}
        className="pixelated h-6 w-6 object-contain sm:h-8 sm:w-8"
        draggable={false}
      />
      {stack.count > 1 && (
        <span className="absolute right-0.5 bottom-0 text-[9px] font-bold text-white drop-shadow-[1px_1px_0_#111] tabular-nums sm:right-1 sm:bottom-0.5 sm:text-[11px]">
          {stack.count}
        </span>
      )}
      {stack.durability !== undefined && maxDur && stack.durability < maxDur && (
        <div className="absolute inset-x-1 bottom-0.5 h-1 bg-[#1b1b1b]">
          <div
            className="h-full bg-[#52e34b]"
            style={{ width: `${Math.max(5, Math.round((stack.durability / maxDur) * 100))}%` }}
          />
        </div>
      )}
    </>
  );
};

export const FurnaceModal: React.FC<FurnaceModalProps> = ({
  hud,
  itemIcons,
  onClose,
  onSetSlot,
  onSetFurnaceSlot,
  onDropStack,
}) => {
  const [cursorStack, setCursorStack] = useState<ItemStack | null>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const furnace = hud.activeFurnace;

  const placeAnywhere = (stack: ItemStack) => {
    const emptyInv = hud.inventory.findIndex((x) => !x);
    if (emptyInv !== -1) {
      onSetSlot('inventory', emptyInv, stack);
      return;
    }
    const emptyHot = hud.hotbar.findIndex((x) => !x);
    if (emptyHot !== -1) {
      onSetSlot('hotbar', emptyHot, stack);
      return;
    }
    onDropStack(stack);
  };

  const handleClose = () => {
    if (cursorStack) {
      placeAnywhere(cursorStack);
      setCursorStack(null);
    }
    onClose();
  };

  const handleExchange = (
    current: ItemStack | null,
    setter: (next: ItemStack | null) => void,
    rightClick: boolean,
    outputOnly = false,
  ) => {
    if (!cursorStack) {
      if (!current) return;
      if (rightClick && current.count > 1 && !outputOnly) {
        const half = Math.ceil(current.count / 2);
        setCursorStack({ ...current, count: half });
        setter({ ...current, count: current.count - half });
      } else {
        setCursorStack({ ...current });
        setter(null);
      }
      return;
    }
    if (outputOnly) {
      if (current && current.id === cursorStack.id) {
        const max = ITEMS[current.id].maxStack;
        if (cursorStack.count + current.count <= max) {
          setCursorStack({ ...cursorStack, count: cursorStack.count + current.count });
          setter(null);
        }
      }
      return;
    }
    if (!current) {
      if (rightClick) {
        setter({ ...cursorStack, count: 1 });
        setCursorStack(
          cursorStack.count <= 1 ? null : { ...cursorStack, count: cursorStack.count - 1 },
        );
      } else {
        setter(cursorStack);
        setCursorStack(null);
      }
      return;
    }
    if (current.id === cursorStack.id) {
      const max = ITEMS[current.id].maxStack;
      const take = rightClick ? 1 : cursorStack.count;
      const add = Math.min(take, max - current.count);
      if (add > 0) {
        setter({ ...current, count: current.count + add });
        const rem = cursorStack.count - add;
        setCursorStack(rem > 0 ? { ...cursorStack, count: rem } : null);
      }
      return;
    }
    const tmp = { ...current };
    setter(cursorStack);
    setCursorStack(tmp);
  };

  const burnPct =
    furnace && furnace.maxBurnTime > 0
      ? Math.min(100, Math.round((furnace.burnTime / furnace.maxBurnTime) * 100))
      : 0;
  const cookPct = furnace ? Math.min(100, Math.round(furnace.cookProgress * 100)) : 0;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mc-panel relative flex max-h-[94vh] w-full max-w-[680px] flex-col gap-2.5 overflow-y-auto p-3 text-[#232323] sm:gap-3 sm:p-4">
        <div className="flex items-center justify-between border-b-2 border-[#8c8c8c] pb-2">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-[#d9571e]" />
            <h2 className="text-xs font-bold tracking-wide uppercase sm:text-sm">
              Ofen &amp; Schmelzen
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {hoveredName && (
              <span className="bg-[#1b1b1b] px-2 py-0.5 text-[11px] font-bold text-white">
                {hoveredName}
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="mc-btn flex h-8 w-8 items-center justify-center sm:h-7 sm:w-7"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Furnace Chamber */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-2 border-[#8c8c8c] bg-[#b5b5b5] p-3">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleExchange(furnace?.input ?? null, (n) => onSetFurnaceSlot('input', n), false)
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleExchange(furnace?.input ?? null, (n) => onSetFurnaceSlot('input', n), true);
                }}
                onMouseEnter={() =>
                  setHoveredName(furnace?.input ? ITEMS[furnace.input.id].name : 'Schmelzgut')
                }
                onMouseLeave={() => setHoveredName(null)}
                className="mc-slot relative flex h-11 w-11 items-center justify-center"
              >
                {furnace?.input && <SlotContent stack={furnace.input} itemIcons={itemIcons} />}
              </button>

              {/* Burn Flame Bar */}
              <div className="h-2.5 w-11 border border-[#454545] bg-[#303030]">
                <div className="h-full bg-[#ff7b1c]" style={{ width: `${burnPct}%` }} />
              </div>

              <button
                type="button"
                onClick={() =>
                  handleExchange(furnace?.fuel ?? null, (n) => onSetFurnaceSlot('fuel', n), false)
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleExchange(furnace?.fuel ?? null, (n) => onSetFurnaceSlot('fuel', n), true);
                }}
                onMouseEnter={() =>
                  setHoveredName(
                    furnace?.fuel ? ITEMS[furnace.fuel.id].name : 'Brennstoff (Kohle/Holz)',
                  )
                }
                onMouseLeave={() => setHoveredName(null)}
                className="mc-slot relative flex h-11 w-11 items-center justify-center"
              >
                {furnace?.fuel && <SlotContent stack={furnace.fuel} itemIcons={itemIcons} />}
              </button>
            </div>

            {/* Progress Arrow */}
            <div className="flex flex-col items-center gap-1">
              <div className="h-3 w-16 border-2 border-[#555] bg-[#444]">
                <div className="h-full bg-[#6fe038]" style={{ width: `${cookPct}%` }} />
              </div>
              <span className="text-[10px] font-bold text-[#3b3b3b]">{cookPct}%</span>
            </div>

            {/* Output */}
            <button
              type="button"
              onClick={() =>
                handleExchange(
                  furnace?.output ?? null,
                  (n) => onSetFurnaceSlot('output', n),
                  false,
                  true,
                )
              }
              onMouseEnter={() =>
                setHoveredName(furnace?.output ? ITEMS[furnace.output.id].name : 'Ergebnis')
              }
              onMouseLeave={() => setHoveredName(null)}
              className="mc-slot relative flex h-12 w-12 items-center justify-center ring-2 ring-[#4c4c4c]"
            >
              {furnace?.output && <SlotContent stack={furnace.output} itemIcons={itemIcons} />}
            </button>
          </div>

          <div className="flex max-w-[260px] flex-col gap-0.5 text-[11px] text-[#2a2a2a]">
            <span className="font-bold uppercase">Schmelz-Rezepte:</span>
            {SMELT_RECIPES.slice(0, 6).map((r) => (
              <div key={r.input} className="truncate font-medium">
                • {ITEMS[r.input].name} → {ITEMS[r.output].name}
              </div>
            ))}
          </div>
        </div>

        {cursorStack && (
          <div className="flex items-center justify-between gap-2 bg-[#232323] px-2.5 py-1 text-xs font-bold text-white">
            <div className="flex items-center gap-2">
              <img src={itemIcons[cursorStack.id]} alt="" className="pixelated h-5 w-5" />
              <span>
                {ITEMS[cursorStack.id].name} ×{cursorStack.count}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onDropStack(cursorStack);
                setCursorStack(null);
              }}
              className="mc-btn flex items-center gap-1 px-2 py-0.5 text-[11px]"
            >
              <Trash2 className="h-3 w-3" />
              Wegwerfen
            </button>
          </div>
        )}

        {/* Bag & Hotbar */}
        <div className="grid grid-cols-9 gap-1">
          {hud.inventory.map((stack, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() =>
                handleExchange(stack, (n) => onSetSlot('inventory', idx, n), false)
              }
              onContextMenu={(e) => {
                e.preventDefault();
                handleExchange(stack, (n) => onSetSlot('inventory', idx, n), true);
              }}
              onMouseEnter={() => setHoveredName(stack ? ITEMS[stack.id].name : null)}
              onMouseLeave={() => setHoveredName(null)}
              className="mc-slot relative flex aspect-square w-full items-center justify-center"
            >
              {stack && <SlotContent stack={stack} itemIcons={itemIcons} />}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-9 gap-1 border-t-2 border-[#7b7b7b] pt-2">
          {hud.hotbar.map((stack, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleExchange(stack, (n) => onSetSlot('hotbar', idx, n), false)}
              onContextMenu={(e) => {
                e.preventDefault();
                handleExchange(stack, (n) => onSetSlot('hotbar', idx, n), true);
              }}
              onMouseEnter={() => setHoveredName(stack ? ITEMS[stack.id].name : null)}
              onMouseLeave={() => setHoveredName(null)}
              className={`relative flex aspect-square w-full items-center justify-center ${
                idx === hud.selectedSlot ? 'mc-slot-active' : 'mc-slot'
              }`}
            >
              {stack && <SlotContent stack={stack} itemIcons={itemIcons} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ChestModal: React.FC<ChestModalProps> = ({
  hud,
  itemIcons,
  onClose,
  onSetSlot,
  onSetChestSlot,
  onDropStack,
}) => {
  const [cursorStack, setCursorStack] = useState<ItemStack | null>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const placeAnywhere = (stack: ItemStack) => {
    const emptyInv = hud.inventory.findIndex((x) => !x);
    if (emptyInv !== -1) {
      onSetSlot('inventory', emptyInv, stack);
      return;
    }
    const emptyHot = hud.hotbar.findIndex((x) => !x);
    if (emptyHot !== -1) {
      onSetSlot('hotbar', emptyHot, stack);
      return;
    }
    onDropStack(stack);
  };

  const handleClose = () => {
    if (cursorStack) {
      placeAnywhere(cursorStack);
      setCursorStack(null);
    }
    onClose();
  };

  const handleExchange = (
    current: ItemStack | null,
    setter: (next: ItemStack | null) => void,
    rightClick: boolean,
  ) => {
    if (!cursorStack) {
      if (!current) return;
      if (rightClick && current.count > 1) {
        const half = Math.ceil(current.count / 2);
        setCursorStack({ ...current, count: half });
        setter({ ...current, count: current.count - half });
      } else {
        setCursorStack({ ...current });
        setter(null);
      }
      return;
    }
    if (!current) {
      if (rightClick) {
        setter({ ...cursorStack, count: 1 });
        setCursorStack(
          cursorStack.count <= 1 ? null : { ...cursorStack, count: cursorStack.count - 1 },
        );
      } else {
        setter(cursorStack);
        setCursorStack(null);
      }
      return;
    }
    if (current.id === cursorStack.id) {
      const max = ITEMS[current.id].maxStack;
      const take = rightClick ? 1 : cursorStack.count;
      const add = Math.min(take, max - current.count);
      if (add > 0) {
        setter({ ...current, count: current.count + add });
        const rem = cursorStack.count - add;
        setCursorStack(rem > 0 ? { ...cursorStack, count: rem } : null);
      }
      return;
    }
    const tmp = { ...current };
    setter(cursorStack);
    setCursorStack(tmp);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mc-panel relative flex max-h-[94vh] w-full max-w-[680px] flex-col gap-2.5 overflow-y-auto p-3 text-[#232323] sm:gap-3 sm:p-4">
        <div className="flex items-center justify-between border-b-2 border-[#8c8c8c] pb-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[#734a20]" />
            <h2 className="text-xs font-bold tracking-wide uppercase sm:text-sm">
              Truhe (27 Lagerplätze)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {hoveredName && (
              <span className="bg-[#1b1b1b] px-2 py-0.5 text-[11px] font-bold text-white">
                {hoveredName}
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="mc-btn flex h-8 w-8 items-center justify-center sm:h-7 sm:w-7"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 27-Slot Chest Grid */}
        <div className="grid grid-cols-9 gap-1 border-2 border-[#8c8c8c] bg-[#b5b5b5] p-1.5">
          {hud.activeChestSlots.map((stack, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleExchange(stack, (n) => onSetChestSlot(idx, n), false)}
              onContextMenu={(e) => {
                e.preventDefault();
                handleExchange(stack, (n) => onSetChestSlot(idx, n), true);
              }}
              onMouseEnter={() => setHoveredName(stack ? ITEMS[stack.id].name : null)}
              onMouseLeave={() => setHoveredName(null)}
              className="mc-slot relative flex aspect-square w-full items-center justify-center"
            >
              {stack && <SlotContent stack={stack} itemIcons={itemIcons} />}
            </button>
          ))}
        </div>

        {cursorStack && (
          <div className="flex items-center justify-between gap-2 bg-[#232323] px-2.5 py-1 text-xs font-bold text-white">
            <div className="flex items-center gap-2">
              <img src={itemIcons[cursorStack.id]} alt="" className="pixelated h-5 w-5" />
              <span>
                {ITEMS[cursorStack.id].name} ×{cursorStack.count}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onDropStack(cursorStack);
                setCursorStack(null);
              }}
              className="mc-btn flex items-center gap-1 px-2 py-0.5 text-[11px]"
            >
              <Trash2 className="h-3 w-3" />
              Wegwerfen
            </button>
          </div>
        )}

        <div className="grid grid-cols-9 gap-1">
          {hud.inventory.map((stack, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() =>
                handleExchange(stack, (n) => onSetSlot('inventory', idx, n), false)
              }
              onContextMenu={(e) => {
                e.preventDefault();
                handleExchange(stack, (n) => onSetSlot('inventory', idx, n), true);
              }}
              onMouseEnter={() => setHoveredName(stack ? ITEMS[stack.id].name : null)}
              onMouseLeave={() => setHoveredName(null)}
              className="mc-slot relative flex aspect-square w-full items-center justify-center"
            >
              {stack && <SlotContent stack={stack} itemIcons={itemIcons} />}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-9 gap-1 border-t-2 border-[#7b7b7b] pt-2">
          {hud.hotbar.map((stack, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleExchange(stack, (n) => onSetSlot('hotbar', idx, n), false)}
              onContextMenu={(e) => {
                e.preventDefault();
                handleExchange(stack, (n) => onSetSlot('hotbar', idx, n), true);
              }}
              onMouseEnter={() => setHoveredName(stack ? ITEMS[stack.id].name : null)}
              onMouseLeave={() => setHoveredName(null)}
              className={`relative flex aspect-square w-full items-center justify-center ${
                idx === hud.selectedSlot ? 'mc-slot-active' : 'mc-slot'
              }`}
            >
              {stack && <SlotContent stack={stack} itemIcons={itemIcons} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
