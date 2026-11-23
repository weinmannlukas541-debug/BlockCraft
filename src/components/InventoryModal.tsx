import React, { useMemo, useState } from 'react';
import { X, Hammer } from 'lucide-react';
import { CREATIVE_PALETTE, ITEMS, RECIPES, matchCraftingRecipe } from '../game/blocks';
import { HudSnapshot, ItemId, ItemStack } from '../game/types';

interface InventoryModalProps {
  hud: HudSnapshot;
  isTable: boolean;
  itemIcons: Record<number, string>;
  onClose: () => void;
  onSetSlot: (area: 'hotbar' | 'inventory', idx: number, stack: ItemStack | null) => void;
  onGiveCreative: (itemId: ItemId) => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  hud,
  isTable,
  itemIcons,
  onClose,
  onSetSlot,
  onGiveCreative,
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

  const handleClose = () => {
    // Return any leftover crafting grid or cursor items to player inventory
    if (cursorStack) {
      placeAnywhere(cursorStack);
      setCursorStack(null);
    }
    craftGrid.forEach((s) => {
      if (s) placeAnywhere(s);
    });
    onClose();
  };

  const placeAnywhere = (stack: ItemStack) => {
    const emptyInv = hud.inventory.findIndex((x) => !x);
    if (emptyInv !== -1) {
      onSetSlot('inventory', emptyInv, stack);
      return;
    }
    const emptyHot = hud.hotbar.findIndex((x) => !x);
    if (emptyHot !== -1) {
      onSetSlot('hotbar', emptyHot, stack);
    }
  };

  const handleBagSlotClick = (area: 'hotbar' | 'inventory', idx: number, rightClick: boolean) => {
    const list = area === 'hotbar' ? hud.hotbar : hud.inventory;
    const current = list[idx];

    if (!cursorStack) {
      if (!current) return;
      if (rightClick && current.count > 1) {
        const half = Math.ceil(current.count / 2);
        setCursorStack({ id: current.id, count: half });
        onSetSlot(area, idx, { id: current.id, count: current.count - half });
      } else {
        setCursorStack({ ...current });
        onSetSlot(area, idx, null);
      }
      return;
    }

    if (!current) {
      if (rightClick) {
        onSetSlot(area, idx, { id: cursorStack.id, count: 1 });
        if (cursorStack.count <= 1) setCursorStack(null);
        else setCursorStack({ id: cursorStack.id, count: cursorStack.count - 1 });
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
        onSetSlot(area, idx, { id: current.id, count: current.count + add });
        const left = cursorStack.count - add;
        setCursorStack(left > 0 ? { id: cursorStack.id, count: left } : null);
      }
      return;
    }

    // Swap
    const temp = { ...current };
    onSetSlot(area, idx, cursorStack);
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
      next[idx] = { id: cursorStack.id, count: put };
      setCraftGrid(next);
      const rem = cursorStack.count - put;
      setCursorStack(rem > 0 ? { id: cursorStack.id, count: rem } : null);
      return;
    }

    if (current.id === cursorStack.id) {
      const max = ITEMS[current.id].maxStack;
      const add = Math.min(rightClick ? 1 : cursorStack.count, max - current.count);
      if (add > 0) {
        next[idx] = { id: current.id, count: current.count + add };
        setCraftGrid(next);
        const rem = cursorStack.count - add;
        setCursorStack(rem > 0 ? { id: cursorStack.id, count: rem } : null);
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

    if (cursorStack) {
      if (cursorStack.id !== out.id) return;
      const max = ITEMS[out.id].maxStack;
      if (cursorStack.count + out.count > max) return;
      setCursorStack({ id: out.id, count: cursorStack.count + out.count });
    } else {
      setCursorStack({ ...out });
    }

    // Consume 1 from each occupied craft slot
    setCraftGrid((prev) =>
      prev.map((s) => {
        if (!s) return null;
        return s.count > 1 ? { id: s.id, count: s.count - 1 } : null;
      }),
    );
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mc-panel relative flex max-h-[94vh] w-full max-w-[680px] flex-col gap-2.5 overflow-y-auto p-3 text-[#232323] sm:gap-3 sm:p-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#8c8c8c] pb-2">
          <div className="flex items-center gap-2">
            <Hammer className="h-4 w-4 text-[#3b3b3b]" />
            <h2 className="text-xs font-bold tracking-wide uppercase sm:text-sm">
              {isTable
                ? 'Werkbank (3×3 Crafting)'
                : hud.gameMode === 'creative'
                  ? 'Kreativ-Inventar'
                  : 'Inventar & Herstellung'}
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

        {/* Creative Palette OR Crafting Section */}
        {hud.gameMode === 'creative' && !isTable ? (
          <div>
            <p className="mb-2 text-xs font-bold text-[#444]">
              Tippe auf einen Block oder ein Werkzeug, um es in deine Hotbar zu legen:
            </p>
            <div className="grid max-h-[210px] grid-cols-6 gap-1 overflow-y-auto border-2 border-[#555] bg-[#a0a0a0] p-1.5 sm:grid-cols-9 sm:gap-1.5 sm:p-2">
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
                    className="mc-slot relative flex h-10 w-10 items-center justify-center sm:h-11 sm:w-11"
                  >
                    {stack && (
                      <>
                        <img
                          src={itemIcons[stack.id]}
                          alt={ITEMS[stack.id].name}
                          className="pixelated h-7 w-7 sm:h-8 sm:w-8"
                        />
                        {stack.count > 1 && (
                          <span className="absolute right-1 bottom-0.5 text-[10px] font-bold text-white drop-shadow-[1px_1px_0_#111] tabular-nums sm:text-[11px]">
                            {stack.count}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                ))}
              </div>

              <span className="text-xl font-black text-[#4a4a4a]">→</span>

              {/* Output Slot */}
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
            <div className="flex max-w-[290px] flex-col gap-1 text-[11px] text-[#2b2b2b]">
              <span className="font-bold uppercase">Rezepte (Tipp):</span>
              <div className="grid max-h-[82px] grid-cols-2 gap-x-3 gap-y-0.5 overflow-y-auto pr-1">
                {RECIPES.filter((r) => isTable || !r.requiresTable).map((r) => (
                  <div key={r.id} className="truncate font-medium">
                    • {ITEMS[r.result.id].name} ×{r.result.count}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cursor Stack Indicator */}
        {cursorStack && (
          <div className="flex items-center gap-2 bg-[#232323] px-2.5 py-1 text-xs font-bold text-white">
            <img src={itemIcons[cursorStack.id]} alt="" className="pixelated h-5 w-5" />
            <span>
              Ausgewählt: {ITEMS[cursorStack.id].name} ×{cursorStack.count} (Tippe auf einen Slot)
            </span>
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
              {stack && (
                <>
                  <img
                    src={itemIcons[stack.id]}
                    alt={ITEMS[stack.id].name}
                    className="pixelated h-6 w-6 sm:h-8 sm:w-8"
                  />
                  {stack.count > 1 && (
                    <span className="absolute right-0.5 bottom-0 text-[9px] font-bold text-white drop-shadow-[1px_1px_0_#111] tabular-nums sm:right-1 sm:bottom-0.5 sm:text-[11px]">
                      {stack.count}
                    </span>
                  )}
                </>
              )}
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
              {stack && (
                <>
                  <img
                    src={itemIcons[stack.id]}
                    alt={ITEMS[stack.id].name}
                    className="pixelated h-6 w-6 sm:h-8 sm:w-8"
                  />
                  {stack.count > 1 && (
                    <span className="absolute right-0.5 bottom-0 text-[9px] font-bold text-white drop-shadow-[1px_1px_0_#111] tabular-nums sm:right-1 sm:bottom-0.5 sm:text-[11px]">
                      {stack.count}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
