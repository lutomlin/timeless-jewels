<script lang="ts">
  import type { Node } from '../skill_tree_types';
  import {
    baseJewelRadius,
    nodeWorldPositions,
    distance,
    drawnGroups,
    drawnNodes,
    formatStats,
    getAffectedNodes,
    inverseSprites,
    inverseSpritesActive,
    inverseTranslations,
    orbitAngleAt,
    skillTree,
    toCanvasCoords
  } from '../skill_tree';
  import type { Point } from '../skill_tree';
  import { onMount } from 'svelte';
  import { calculator, data } from '../types';

  export let clickNode: (node: Node) => void;
  export let circledNode: number | undefined;
  export let selectedJewel: number;
  export let selectedConqueror: string;
  export let seed: number;
  export let highlighted: number[] = [];
  export let disabled: number[] = [];
  export let highlightJewels = false;

  const startGroups = [427, 320, 226, 227, 323, 422, 329];
  const titleFont = '25px Roboto';
  const statsFont = '17px Roboto';

  let scaling = 10;
  let offsetX = 0;
  let offsetY = 0;
  const drawScaling = 2.6;

  const spriteCache: Record<string, HTMLImageElement> = {};
  const spriteCacheActive: Record<string, HTMLImageElement> = {};

  const drawSprite = (
    context: CanvasRenderingContext2D,
    path: string,
    pos: Point,
    active = false,
    mirrored = false
  ) => {
    let sprite = active ? inverseSpritesActive[path] : inverseSprites[path];
    if (!sprite && active) sprite = inverseSprites[path];

    const spriteSheetUrl = sprite.filename;
    const cache = active ? spriteCacheActive : spriteCache;
    if (!(spriteSheetUrl in cache)) {
      cache[spriteSheetUrl] = new Image();
      cache[spriteSheetUrl].src = spriteSheetUrl;
    }

    const self = sprite.coords[path];
    const newWidth = (self.w / scaling) * drawScaling;
    const newHeight = (self.h / scaling) * drawScaling;
    const topLeftX = pos.x - newWidth / 2;
    const topLeftY = pos.y - newHeight / 2;
    const finalY = mirrored ? topLeftY - newHeight / 2 : topLeftY;

    context.drawImage(cache[spriteSheetUrl], self.x, self.y, self.w, self.h, topLeftX, finalY, newWidth, newHeight);

    if (mirrored) {
      context.save();
      context.translate(topLeftX, topLeftY);
      context.rotate(Math.PI);
      context.drawImage(
        cache[spriteSheetUrl],
        self.x,
        self.y,
        self.w,
        self.h,
        -newWidth,
        -(newHeight / 2),
        newWidth,
        -newHeight
      );
      context.restore();
    }
  };

  const wrapText = (text: string, context: CanvasRenderingContext2D, maxWidth: number): string[] => {
    const result: string[] = [];
    let currentWord = '';
    text.split(' ').forEach((word) => {
      if (context.measureText(currentWord + word).width < maxWidth) {
        currentWord += ' ' + word;
      } else {
        result.push(currentWord.trim());
        currentWord = word;
      }
    });
    if (currentWord.length > 0) result.push(currentWord.trim());
    return result;
  };

  let mousePos: Point = { x: Number.MIN_VALUE, y: Number.MIN_VALUE };
  let cursor = 'unset';
  let hoveredNode: Node | undefined;
  let highlightedSet = new Set<number>(highlighted);
  let disabledSet = new Set<number>(disabled);
  let affectedSkills = new Set<number>();
  let calculateCache: Record<number, ReturnType<typeof calculator.Calculate>> = {};

  $: {
    highlightedSet = new Set(highlighted);
    scheduleRender();
  }
  $: {
    disabledSet = new Set(disabled);
    scheduleRender();
  }
  $: {
    affectedSkills = circledNode
      ? new Set(getAffectedNodes(skillTree.nodes[circledNode]).map((n) => n.skill))
      : new Set<number>();
    scheduleRender();
  }
  $: {
    seed;
    selectedJewel;
    selectedConqueror;
    calculateCache = {};
    scheduleRender();
  }
  $: {
    highlightJewels;
    scheduleRender();
  }

  const overscroll = 400;

  let canvasEl: HTMLCanvasElement;
  let width = 0;
  let height = 0;
  let rafPending = false;

  function scheduleRender() {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(doRender);
    }
  }

  function doRender() {
    rafPending = false;
    if (!canvasEl) return;
    const context = canvasEl.getContext('2d');
    if (!context) return;

    const start = performance.now();
    const w = width;
    const h = height;
    const cw = w + 2 * overscroll;
    const ch = h + 2 * overscroll;

    context.clearRect(0, 0, cw, ch);
    context.fillStyle = '#080c11';
    context.fillRect(0, 0, cw, ch);

    context.save();
    context.translate(overscroll, overscroll);

    const jewelRadius = baseJewelRadius / scaling;
    const slowTime = highlighted.length > 0 || highlightJewels ? Math.round(performance.now() / 40) : 0;

    const margin = 200;
    const visMinX = -Math.abs(skillTree.min_x) - offsetX - (overscroll + margin) * scaling;
    const visMaxX = -Math.abs(skillTree.min_x) - offsetX + (w + overscroll + margin) * scaling;
    const visMinY = -Math.abs(skillTree.min_y) - offsetY - (overscroll + margin) * scaling;
    const visMaxY = -Math.abs(skillTree.min_y) - offsetY + (h + overscroll + margin) * scaling;
    const inView = (wx: number, wy: number) => wx >= visMinX && wx <= visMaxX && wy >= visMinY && wy <= visMaxY;

    const connected: Record<string, boolean> = {};

    Object.keys(drawnGroups).forEach((groupId) => {
      const group = drawnGroups[groupId];
      if (!inView(group.x, group.y)) return;
      const groupPos = toCanvasCoords(group.x, group.y, offsetX, offsetY, scaling);
      const maxOrbit = Math.max(...group.orbits);
      if (startGroups.indexOf(parseInt(groupId)) >= 0) {
        // skip starter nodes
      } else if (maxOrbit == 1) {
        drawSprite(context, 'PSGroupBackground1', groupPos, false);
      } else if (maxOrbit == 2) {
        drawSprite(context, 'PSGroupBackground2', groupPos, false);
      } else if (maxOrbit == 3 || group.orbits.length > 1) {
        drawSprite(context, 'PSGroupBackground3', groupPos, false, true);
      }
    });

    Object.keys(drawnNodes).forEach((nodeId) => {
      const node = drawnNodes[nodeId];
      const wp = nodeWorldPositions[parseInt(nodeId)];
      if (!inView(wp.x, wp.y)) return;
      const angle = orbitAngleAt(node.orbit, node.orbitIndex);
      const rotatedPos = toCanvasCoords(wp.x, wp.y, offsetX, offsetY, scaling);

      node.out?.forEach((o) => {
        if (!drawnNodes[parseInt(o)]) return;
        const min = Math.min(parseInt(o), parseInt(nodeId));
        const max = Math.max(parseInt(o), parseInt(nodeId));
        const joined = min + ':' + max;
        if (joined in connected) return;
        connected[joined] = true;

        const targetNode = drawnNodes[parseInt(o)];
        if (!targetNode || targetNode.isMastery) return;

        const targetAngle = orbitAngleAt(targetNode.orbit, targetNode.orbitIndex);
        const twp = nodeWorldPositions[parseInt(o)];
        const targetRotatedPos = toCanvasCoords(twp.x, twp.y, offsetX, offsetY, scaling);

        context.beginPath();
        if (node.group != targetNode.group || node.orbit != targetNode.orbit) {
          context.moveTo(rotatedPos.x, rotatedPos.y);
          context.lineTo(targetRotatedPos.x, targetRotatedPos.y);
        } else {
          let a = Math.PI / 180 - (Math.PI / 180) * angle;
          let b = Math.PI / 180 - (Math.PI / 180) * targetAngle;
          a -= Math.PI / 2;
          b -= Math.PI / 2;
          const diff = Math.abs(Math.max(a, b) - Math.min(a, b));
          const finalA = diff > Math.PI ? Math.max(a, b) : Math.min(a, b);
          const finalB = diff > Math.PI ? Math.min(a, b) : Math.max(a, b);
          const group = drawnGroups[node.group];
          const groupPos = toCanvasCoords(group.x, group.y, offsetX, offsetY, scaling);
          context.arc(groupPos.x, groupPos.y, skillTree.constants.orbitRadii[node.orbit] / scaling + 1, finalA, finalB);
        }
        context.lineWidth = 6 / scaling;
        context.strokeStyle = '#524518';
        context.stroke();
      });
    });

    let circledNodePos: Point | undefined;
    if (circledNode) {
      const cwp = nodeWorldPositions[circledNode];
      circledNodePos = toCanvasCoords(cwp.x, cwp.y, offsetX, offsetY, scaling);
    }

    let newHoverNode: Node | undefined;
    Object.keys(drawnNodes).forEach((nodeId) => {
      const node = drawnNodes[nodeId];
      const wp2 = nodeWorldPositions[parseInt(nodeId)];
      if (!inView(wp2.x, wp2.y)) return;
      const rotatedPos = toCanvasCoords(wp2.x, wp2.y, offsetX, offsetY, scaling);
      let touchDistance = 0;

      let active = false;
      if (circledNodePos && distance(rotatedPos, circledNodePos) < jewelRadius) active = true;
      if (disabledSet.has(node.skill)) active = false;

      if (node.isKeystone) {
        touchDistance = 110;
        drawSprite(context, node.icon, rotatedPos, active);
        drawSprite(context, active ? 'KeystoneFrameAllocated' : 'KeystoneFrameUnallocated', rotatedPos, false);
      } else if (node.isNotable) {
        touchDistance = 70;
        drawSprite(context, node.icon, rotatedPos, active);
        drawSprite(context, active ? 'NotableFrameAllocated' : 'NotableFrameUnallocated', rotatedPos, false);
      } else if (node.isJewelSocket) {
        touchDistance = 70;
        if (node.expansionJewel) {
          drawSprite(context, 'JewelSocketAltNormal', rotatedPos, false);
        } else {
          drawSprite(context, active ? 'JewelFrameAllocated' : 'JewelFrameUnallocated', rotatedPos, false);
        }
      } else if (node.isMastery) {
        drawSprite(context, node.inactiveIcon, rotatedPos, active);
      } else {
        touchDistance = 50;
        drawSprite(context, node.icon, rotatedPos, active);
        drawSprite(context, active ? 'PSSkillFrameActive' : 'PSSkillFrame', rotatedPos, false);
      }

      if (highlightedSet.has(node.skill) || (highlightJewels && node.isJewelSocket)) {
        context.strokeStyle = `hsl(${slowTime}, 100%, 50%)`;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(rotatedPos.x, rotatedPos.y, (touchDistance + 30) / scaling, 0, Math.PI * 2);
        context.stroke();
      }

      if (distance(rotatedPos, mousePos) < touchDistance / scaling) {
        newHoverNode = node;
      }
    });

    hoveredNode = newHoverNode;

    if (circledNodePos) {
      context.strokeStyle = '#ad2b2b';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(circledNodePos.x, circledNodePos.y, jewelRadius, 0, Math.PI * 2);
      context.stroke();
    }

    if (hoveredNode) {
      const nodeName = hoveredNode.name;
      const nodeStats: { text: string; special: boolean }[] = (hoveredNode.stats || []).map((s) => ({
        text: s,
        special: false
      }));

      if (
        !hoveredNode.isJewelSocket &&
        hoveredNode.skill &&
        seed &&
        selectedJewel &&
        selectedConqueror &&
        affectedSkills.has(hoveredNode.skill)
      ) {
        const passiveIndex = data.TreeToPassive[hoveredNode.skill].Index;
        if (!(passiveIndex in calculateCache)) {
          calculateCache[passiveIndex] = calculator.Calculate(passiveIndex, seed, selectedJewel, selectedConqueror);
        }
        const result = calculateCache[passiveIndex];

        if (result) {
          if ('AlternatePassiveSkill' in result && result.AlternatePassiveSkill) {
            nodeStats.push({ text: '', special: false });
            nodeStats.push({ text: `Replaced By: ${result.AlternatePassiveSkill.Name}`, special: true });

            if ('StatsKeys' in result.AlternatePassiveSkill) {
              result.AlternatePassiveSkill.StatsKeys.forEach((statId, i) => {
                const stat = data.GetStatByIndex(statId);
                const translation = inverseTranslations[stat.ID] || '';
                if (translation) {
                  nodeStats.push({
                    text: formatStats(translation, result.StatRolls[i]) || stat.ID,
                    special: true
                  });
                }
              });
            }
          }

          if (result.AlternatePassiveAdditionInformations) {
            result.AlternatePassiveAdditionInformations.forEach((info) => {
              if ('StatsKeys' in info.AlternatePassiveAddition) {
                info.AlternatePassiveAddition.StatsKeys.forEach((statId, i) => {
                  const stat = data.GetStatByIndex(statId);
                  const translation = inverseTranslations[stat.ID] || '';
                  if (translation) {
                    nodeStats.push({
                      text: formatStats(translation, info.StatRolls[i]) || stat.ID,
                      special: true
                    });
                  }
                });
              }
            });
          }
        }
      }

      context.font = titleFont;
      const textMetrics = context.measureText(nodeName);
      const maxWidth = Math.max(textMetrics.width + 50, 600);

      context.font = statsFont;
      const allLines: { text: string; offset: number; special: boolean }[] = [];
      const padding = 30;
      let offset = 85;

      if (nodeStats && nodeStats.length > 0) {
        nodeStats.forEach((stat) => {
          if (allLines.length > 0) offset += 3;
          stat.text.split('\n').forEach((line) => {
            if (allLines.length > 0) offset += 5;
            const lines = wrapText(line, context, maxWidth - padding);
            lines.forEach((l) => {
              allLines.push({ text: l, offset, special: stat.special });
              offset += 16;
            });
          });
        });
      } else if (hoveredNode.isJewelSocket) {
        allLines.push({ text: 'Click to select this socket', offset, special: true });
        offset += 20;
      }

      const titleHeight = 55;
      context.fillStyle = 'rgba(75,63,24,0.9)';
      context.fillRect(mousePos.x, mousePos.y, maxWidth, titleHeight);

      context.fillStyle = '#ffffff';
      context.font = titleFont;
      context.textAlign = 'center';
      context.fillText(nodeName, mousePos.x + maxWidth / 2, mousePos.y + 35);

      context.fillStyle = 'rgba(0,0,0,0.8)';
      context.fillRect(mousePos.x, mousePos.y + titleHeight, maxWidth, offset - titleHeight);

      context.font = statsFont;
      context.textAlign = 'left';
      allLines.forEach((l) => {
        context.fillStyle = l.special ? '#8cf34c' : '#ffffff';
        context.fillText(l.text, mousePos.x + padding / 2, mousePos.y + l.offset);
      });
    }

    cursor = hoveredNode?.isJewelSocket ? 'pointer' : 'unset';

    context.restore();

    context.fillStyle = '#ffffff';
    context.textAlign = 'right';
    context.font = '12px Roboto';
    const end = performance.now();
    context.fillText(`${(end - start).toFixed(1)}ms`, cw - 5, overscroll + 17);

    if (highlighted.length > 0 || highlightJewels) {
      scheduleRender();
    }
  }

  let downX = 0;
  let downY = 0;
  let startX = 0;
  let startY = 0;
  let down = false;
  let dragPixelX = 0;
  let dragPixelY = 0;

  const mouseDown = (event: MouseEvent) => {
    down = true;
    downX = event.clientX;
    downY = event.clientY;
    startX = offsetX;
    startY = offsetY;
    dragPixelX = 0;
    dragPixelY = 0;
    mousePos = { x: event.clientX, y: event.clientY };
    if (hoveredNode) clickNode(hoveredNode);
  };

  const mouseUp = (event: PointerEvent) => {
    if (event.type === 'pointerup' && down) {
      down = false;
      // Commit the CSS-translated position into world coords and do one redraw
      offsetX = startX + dragPixelX * scaling;
      offsetY = startY + dragPixelY * scaling;
      dragPixelX = 0;
      dragPixelY = 0;
      if (canvasEl) canvasEl.style.transform = '';
      mousePos = { x: event.clientX, y: event.clientY };
      scheduleRender();
    }
  };

  const mouseMove = (event: MouseEvent) => {
    if (down) {
      dragPixelX = event.clientX - downX;
      dragPixelY = event.clientY - downY;
      if (canvasEl) canvasEl.style.transform = `translate(${dragPixelX}px, ${dragPixelY}px)`;
      // No redraw — canvas content is unchanged, just shifted by CSS
      return;
    }
    if (event.target === canvasEl) {
      mousePos = { x: event.clientX, y: event.clientY };
    } else {
      mousePos = { x: Number.MIN_VALUE, y: Number.MIN_VALUE };
    }
    scheduleRender();
  };

  const onScroll = (event: WheelEvent) => {
    if (event.deltaY > 0) {
      if (scaling < 30) {
        offsetX += event.offsetX;
        offsetY += event.offsetY;
      }
    } else {
      if (scaling > 3) {
        offsetX -= event.offsetX;
        offsetY -= event.offsetY;
      }
    }
    scaling = Math.min(30, Math.max(3, scaling + event.deltaY / 100));
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    scheduleRender();
  };

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    if (canvasEl) {
      canvasEl.width = width + 2 * overscroll;
      canvasEl.height = height + 2 * overscroll;
    }
    scheduleRender();
  };

  let initialized = false;
  $: {
    if (!initialized && skillTree) {
      initialized = true;
      offsetX = skillTree.min_x + (window.innerWidth / 2) * scaling;
      offsetY = skillTree.min_y + (window.innerHeight / 2) * scaling;
      scheduleRender();
    }
  }

  onMount(() => {
    resize();
  });
</script>

<svelte:window on:pointerup={mouseUp} on:pointermove={mouseMove} on:resize={resize} />

<div style="touch-action: none; cursor: {cursor}; position: relative; overflow: hidden; width: 100vw; height: 100vh;">
  <canvas
    bind:this={canvasEl}
    style="position: absolute; left: -{overscroll}px; top: -{overscroll}px;"
    on:pointerdown={mouseDown}
    on:wheel={onScroll} />
  <slot />
</div>
