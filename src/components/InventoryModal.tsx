import React, { useMemo, useState } from 'react';
import { Hammer, Shield, Trash2, X } from 'lucide-react';
import { CREATIVE_PALETTE, ITEMS, RECIPES, matchCraftingRecipe } from '../game/blocks';
import { ArmorSlot, HudSnapshot, ItemId, ItemStack } from '../game/types';

interface InventoryModalProps {
  hud: HudSnapshot;
  isTable: boolean;
  itemIcons: Record<number, string>;
  onClose: () => void;
  onSetSlot: (
    area: 'hotbar' | 'inventory' | 'armor' | 'offhand',
    idx: number,
    stack: ItemStack | null,
  ) => void;
  onGiveCreative: (itemId: ItemId) => void;
  onDropStack: (stack: ItemStack) => void;
}

const ARMOR_SLOTS: { slot: ArmorSlot; label: string }[] = [
  { slot: 'helmet', label: 'Helm' },
  { slot: 'chestplate', label: 'Brust' },
  { slot: 'leggings', label: 'Hose' },
  { slot: 'boots', label: 'Stiefel' },
];

const SlotInner: React.FC<{ stack: ItemStack; itemIcons: Record<number, string> }> = ({
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

export const InventoryModal: React.FC<InventoryModalProps> = ({
  hud,
  isTable,
  itemIcons,
  onClose,
  onSetSlot,
  onGiveCreative,
  onDropStack,
}) => {
  const gridSize: 2 | 3 = isTable ? 3 : 2;
  const [craftGrid, setCraftGrid] = useState<(ItemStack | null)[]>(() =>
    new Array(gridSize * gridSize).fill(null),
  );
  const [cursorStack, setCursorStack] = useState<ItemStack | null>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const matchedRecipe = useMemo(() => {
    const ids = craftGrid.map((s) => (s ? s.id : null));
    return matchCraftingRecipe(ids, gridSize);
  }, [craftGrid, gridSize]);

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
    craftGrid.forEach((s) => {
      if (s) placeAnywhere(s);
    });
    onClose();
  };

  const handleBagSlotClick = (area: 'hotbar' | 'inventory', idx: number, rightClick: boolean) => {
    const list = area === 'hotbar' ? hud.hotbar : hud.inventory;
    const current = list[idx];

    if (!cursorStack) {
      if (!current) return;
      if (rightClick && current.count > 1) {
        const half = Math.ceil(current.count / 2);
        setCursorStack({ ...current, count: half });
        onSetSlot(area, idx, { ...current, count: current.count - half });
      } else {
        setCursorStack({ ...current });
        onSetSlot(area, idx, null);
      }
      return;
    }

    if (!current) {
      if (rightClick) {
        onSetSlot(area, idx, { ...cursorStack, count: 1 });
        if (cursorStack.count <= 1) setCursorStack(null);
        else setCursorStack({ ...cursorStack, count: cursorStack.count - 1 });
      } else {
        onSetSlot(area, idx, cursorStack);
        setCursorStack(null);
      }
      return;
    }

    if (current.id === cursorStack.id) {
      const max = ITEMS[current.id].maxStack;
      const take = rightClick ? 1 : cursorStack.count;
      const add = Math.min(take, max - current.count);
      if (add > 0) {
        onSetSlot(area, idx, { ...current, count: current.count + add });
        const left = cursorStack.count - add;
        setCursorStack(left > 0 ? { ...cursorStack, count: left } : null);
      }
      return;
    }

    const temp = { ...current };
    onSetSlot(area, idx, cursorStack);
    setCursorStack(temp);
  };

  const handleArmorSlotClick = (idx: number, expectedSlot: ArmorSlot) => {
    const current = hud.armor[idx];
    if (!cursorStack) {
      if (!current) return;
      setCursorStack({ ...current });
      onSetSlot('armor', idx, null);
      return;
    }
    if (ITEMS[cursorStack.id]?.armorSlot !== expectedSlot) return;
    const temp = current ? { ...current } : null;
    onSetSlot('armor', idx, cursorStack);
    setCursorStack(temp);
  };

  const handleOffhandClick = () => {
    const current = hud.offhand;
    if (!cursorStack) {
      if (!current) return;
      setCursorStack({ ...current });
      onSetSlot('offhand', 0, null);
      return;
    }
    if (cursorStack.id !== ItemId.Shield) return;
    const temp = current ? { ...current } : null;
    onSetSlot('offhand', 0, cursorStack);
    setCursorStack(temp);
  };

  const handleCraftSlotClick = (idx: number, rightClick: boolean) => {
    const current = craftGrid[idx];
    const next = [...craftGrid];

    if (!cursorStack) {
      if (!current) return;
      setCursorStack({ ...current });
      next[idx] = null;
      setCraftGrid(next);
      return;
    }

    if (!current) {
      const put = rightClick ? 1 : cursorStack.count;
      next[idx] = { ...cursorStack, count: put };
      setCraftGrid(next);
      const rem = cursorStack.count - put;
      setCursorStack(rem > 0 ? { ...cursorStack, count: rem } : null);
      return;
    }

    if (current.id === cursorStack.id) {
      const max = ITEMS[current.id].maxStack;
      const add = Math.min(rightClick ? 1 : cursorStack.count, max - current.count);
      if (add > 0) {
        next[idx] = { ...current, count: current.count + add };
        setCraftGrid(next);
        const rem = cursorStack.count - add;
        setCursorStack(rem > 0 ? { ...cursorStack, count: rem } : null);
      }
      return;
    }

    next[idx] = cursorStack;
    setCraftGrid(next);
    setCursorStack({ ...current });
  };

  const handleTakeCraftOutput = () => {
    if (!matchedRecipe) return;
    const out = matchedRecipe.result;
    const dur = ITEMS[out.id]?.maxDurability;

    if (cursorStack) {
      if (cursorStack.id !== out.id) return;
      const max = ITEMS[out.id].maxStack;
      if (cursorStack.count + out.count > max) return;
      setCursorStack({ ...cursorStack, count: cursorStack.count + out.count });
    } else {
      setCursorStack({ id: out.id, count: out.count, durability: dur });
    }

    setCraftGrid((prev) =>
      prev.map((s) => {
        if (!s) return null;
        return s.count > 1 ? { ...s, count: s.count - 1 } : null;
      }),
    );
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mc-panel relative flex max-h-[94vh] w-full max-w-[700px] flex-col gap-2.5 overflow-y-auto p-3 text-[#232323] sm:gap-3 sm:p-4">
        <div className="flex items-center justify-between border-b-2 border-[#8c8c8c] pb-2">
          <div className="flex items-center gap-2">
            <Hammer className="h-4 w-4 text-[#3b3b3b]" />
            <h2 className="text-xs font-bold tracking-wide uppercase sm:text-sm">
              {isTable
                ? 'Werkbank (3×3 Crafting)'
                : hud.gameMode === 'creative'
                  ? 'Kreativ-Inventar'
                  : 'Inventar, Rüstung & Herstellung'}
            </h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {hoveredName && (
              <span className="bg-[#1b1b1b] px-2 py-0.5 text-[11px] font-bold text-white sm:text-xs">
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

        {/* Creative Palette OR Armor + Crafting Section */}
        {hud.gameMode === 'creative' && !isTable ? (
          <div>
            <p className="mb-2 text-xs font-bold text-[#444]">
              Tippe auf einen Block, ein Werkzeug oder eine Rüstung für deine Hotbar:
            </p>
            <div className="grid max-h-[220px] grid-cols-6 gap-1 overflow-y-auto border-2 border-[#555] bg-[#a0a0a0] p-1.5 sm:grid-cols-9 sm:gap-1.5 sm:p-2">
              {CREATIVE_PALETTE.map((itemId) => (
                <button
                  key={itemId}
                  type="button"
                  onClick={() => onGiveCreative(itemId)}
                  onMouseEnter={() => setHoveredName(ITEMS[itemId].name)}
                  onMouseLeave={() => setHoveredName(null)}
                  className="mc-slot flex aspect-square w-full items-center justify-center hover:brightness-110"
                >
                  <img
                    src={itemIcons[itemId]}
                    alt={ITEMS[itemId].name}
                    className="pixelated h-7 w-7 object-contain sm:h-8 sm:w-8"
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-[#8c8c8c] bg-[#b5b5b5] p-2.5 sm:gap-4 sm:p-3">
            {/* Armor + Offhand Shield Slots (visible in main inventory) */}
            {!isTable && (
              <div className="flex items-center gap-1.5">
                <div className="flex flex-col gap-1">
                  {ARMOR_SLOTS.map((a, idx) => {
                    const st = hud.armor[idx];
                    return (
                      <button
                        key={a.slot}
                        type="button"
                        onClick={() => handleArmorSlotClick(idx, a.slot)}
                        onMouseEnter={() => setHoveredName(st ? ITEMS[st.id].name : a.label)}
                        onMouseLeave={() => setHoveredName(null)}
                        title={a.label}
                        className="mc-slot relative flex h-8 w-8 items-center justify-center text-[9px] font-bold text-[#4a4a4a] sm:h-9 sm:w-9"
                      >
                        {st ? (
                          <SlotInner stack={st} itemIcons={itemIcons} />
                        ) : (
                          <span>{a.label[0]}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleOffhandClick}
                  onMouseEnter={() =>
                    setHoveredName(hud.offhand ? ITEMS[hud.offhand.id].name : 'Schild-Slot')
                  }
                  onMouseLeave={() => setHoveredName(null)}
                  title="Nebenhand (Schild)"
                  className="mc-slot relative flex h-10 w-10 items-center justify-center text-[#4a4a4a]"
                >
                  {hud.offhand ? (
                    <SlotInner stack={hud.offhand} itemIcons={itemIcons} />
                  ) : (
                    <Shield className="h-4 w-4 opacity-50" />
                  )}
                </button>
              </div>
            )}

            {/* Crafting Grid */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
              >
                {craftGrid.map((stack, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleCraftSlotClick(idx, false)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleCraftSlotClick(idx, true);
                    }}
                    onMouseEnter={() => setHoveredName(stack ? ITEMS[stack.id].name : null)}
                    onMouseLeave={() => setHoveredName(null)}
                    className="mc-slot relative flex h-9 w-9 items-center justify-center sm:h-11 sm:w-11"
                  >
                    {stack && <SlotInner stack={stack} itemIcons={itemIcons} />}
                  </button>
                ))}
              </div>

              <span className="text-xl font-black text-[#4a4a4a]">→</span>

              <button
                type="button"
                onClick={handleTakeCraftOutput}
                onMouseEnter={() =>
                  setHoveredName(matchedRecipe ? ITEMS[matchedRecipe.result.id].name : null)
                }
                onMouseLeave={() => setHoveredName(null)}
                className="mc-slot relative flex h-11 w-11 items-center justify-center ring-2 ring-[#4c4c4c] sm:h-12 sm:w-12"
              >
                {matchedRecipe && (
                  <>
                    <img
                      src={itemIcons[matchedRecipe.result.id]}
                      alt={ITEMS[matchedRecipe.result.id].name}
                      className="pixelated h-8 w-8 sm:h-9 sm:w-9"
                    />
                    {matchedRecipe.result.count > 1 && (
                      <span className="absolute right-1 bottom-0.5 text-[10px] font-bold text-white drop-shadow-[1px_1px_0_#111] tabular-nums sm:text-[11px]">
                        {matchedRecipe.result.count}
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>

            {/* Compact Recipe Quick-Reference */}
            <div className="flex max-w-[260px] flex-col gap-1 text-[11px] text-[#2b2b2b]">
              <span className="font-bold uppercase">Rezepte:</span>
              <div className="grid max-h-[82px] grid-cols-2 gap-x-2.5 gap-y-0.5 overflow-y-auto pr-1">
                {RECIPES.filter((r) => isTable || !r.requiresTable).map((r) => (
                  <div key={r.id} className="truncate font-medium">
                    • {ITEMS[r.result.id].name} ×{r.result.count}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cursor Stack Indicator + Mobile Drop Button */}
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

        {/* 27-Slot Bag */}
        <div className="grid grid-cols-9 gap-1">
          {hud.inventory.map((stack, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleBagSlotClick('inventory', idx, false)}
              onContextMenu={(e) => {
                e.preventDefault();
                handleBagSlotClick('inventory', idx, true);
              }}
              onMouseEnter={() => setHoveredName(stack ? ITEMS[stack.id].name : null)}
              onMouseLeave={() => setHoveredName(null)}
              className="mc-slot relative flex aspect-square w-full items-center justify-center"
            >
              {stack && <SlotInner stack={stack} itemIcons={itemIcons} />}
            </button>
          ))}
        </div>

        {/* 9-Slot Hotbar Row */}
        <div className="grid grid-cols-9 gap-1 border-t-2 border-[#7b7b7b] pt-2">
          {hud.hotbar.map((stack, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleBagSlotClick('hotbar', idx, false)}
              onContextMenu={(e) => {
                e.preventDefault();
                handleBagSlotClick('hotbar', idx, true);
              }}
              onMouseEnter={() => setHoveredName(stack ? ITEMS[stack.id].name : null)}
              onMouseLeave={() => setHoveredName(null)}
              className={`relative flex aspect-square w-full items-center justify-center ${
                idx === hud.selectedSlot ? 'mc-slot-active' : 'mc-slot'
              }`}
            >
              {stack && <SlotInner stack={stack} itemIcons={itemIcons} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
