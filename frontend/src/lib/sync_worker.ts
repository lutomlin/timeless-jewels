import { expose } from 'comlink';
import '../wasm_exec.js';
import { loadSkillTree, passiveToTree } from './skill_tree';
import type { SearchWithSeed, ReverseSearchConfig, SearchResults } from './skill_tree';
import { calculator, initializeCrystalline } from './types';

const obj = {
  boot(wasm: ArrayBuffer) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const go = new Go();
    WebAssembly.instantiate(wasm, go.importObject).then((result) => {
      go.run(result.instance);

      initializeCrystalline();

      loadSkillTree();
    });
  },
  async search(args: ReverseSearchConfig, callback: (seed: number) => Promise<void>): Promise<SearchResults> {
    const searchResult = await calculator.ReverseSearch(
      [...args.nodes, ...args.anointNodes],
      args.stats.map((s) => s.id),
      args.jewel,
      args.conqueror,
      callback
    );

    const anointSet = new Set(args.anointNodes);

    const searchGrouped: { [key: number]: SearchWithSeed[] } = {};
    Object.keys(searchResult).forEach((seedStr) => {
      const seed = parseInt(seedStr);

      const statCounts: Record<number, number> = {};
      const anointCandidates: { score: number; skillID: number }[] = [];

      const skills = Object.keys(searchResult[seed])
        .filter((skillIDStr) => !anointSet.has(parseInt(skillIDStr)))
        .map((skillIDStr) => {
          const skillID = parseInt(skillIDStr);
          Object.keys(searchResult[seed][skillID]).forEach((st) => {
            const n = parseInt(st);
            statCounts[n] = (statCounts[n] || 0) + 1;
          });
          return {
            passive: passiveToTree[skillID],
            stats: searchResult[seed][skillID]
          };
        });

      if (args.anoints > 0) {
        Object.keys(searchResult[seed])
          .filter((skillIDStr) => anointSet.has(parseInt(skillIDStr)))
          .forEach((skillIDStr) => {
            const skillID = parseInt(skillIDStr);
            const nodeStatCounts: Record<number, number> = {};
            Object.keys(searchResult[seed][skillID]).forEach((st) => {
              const n = parseInt(st);
              nodeStatCounts[n] = (nodeStatCounts[n] || 0) + 1;
            });
            let nodeScore = 0;
            for (const stat of args.stats) {
              const count = nodeStatCounts[stat.id] || 0;
              const effectiveCount = stat.max > 0 ? Math.min(count, stat.max) : count;
              nodeScore += effectiveCount * stat.weight;
            }
            anointCandidates.push({ score: nodeScore, skillID });
          });
        anointCandidates.sort((a, b) => b.score - a.score);
        for (let i = 0; i < Math.min(args.anoints, anointCandidates.length); i++) {
          const { skillID } = anointCandidates[i];
          skills.push({
            passive: passiveToTree[skillID],
            stats: searchResult[seed][skillID]
          });
        }
      }

      let weight = 0;
      for (const stat of args.stats) {
        const count = statCounts[stat.id] || 0;
        const effectiveCount = stat.max > 0 ? Math.min(count, stat.max) : count;
        weight += effectiveCount * stat.weight;
      }
      for (let i = 0; i < Math.min(args.anoints, anointCandidates.length); i++) {
        weight += anointCandidates[i].score;
      }

      const len = skills.length;
      searchGrouped[len] = [
        ...(searchGrouped[len] || []),
        {
          skills: skills,
          seed,
          weight,
          statCounts
        }
      ];
    });

    Object.keys(searchGrouped).forEach((len) => {
      const nLen = parseInt(len);
      searchGrouped[nLen] = searchGrouped[nLen].filter((g) => {
        if (g.weight < args.minTotalWeight) {
          return false;
        }

        for (const stat of args.stats) {
          if ((g.statCounts[stat.id] === undefined && stat.min > 0) || g.statCounts[stat.id] < stat.min) {
            return false;
          }
        }

        return true;
      });

      if (Object.keys(searchGrouped[nLen]).length == 0) {
        delete searchGrouped[nLen];
      } else {
        searchGrouped[nLen] = searchGrouped[nLen].sort((a, b) => b.weight - a.weight);
      }
    });

    return {
      grouped: searchGrouped,
      raw: Object.keys(searchGrouped)
        .map((x) => searchGrouped[parseInt(x)])
        .flat()
        .sort((a, b) => b.weight - a.weight)
    };
  }
} as const;

expose(obj);

export type WorkerType = typeof obj;
