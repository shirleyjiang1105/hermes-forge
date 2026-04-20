import fs from "node:fs/promises";

export type MemoryBudget = {
  userMaxCharacters: number;
  memoryMaxCharacters: number;
  contextMaxCharacters: number;
};

export class MemoryBudgeter {
  constructor(
    private readonly budget: MemoryBudget = {
      userMaxCharacters: 12000,
      memoryMaxCharacters: 16000,
      contextMaxCharacters: 3200,
    },
  ) {}

  get contextMaxCharacters() {
    return this.budget.contextMaxCharacters;
  }

  async getFileStatus(filePath: string, maxCharacters: number) {
    const text = await fs.readFile(filePath, "utf8").catch(() => "");
    return {
      usedCharacters: text.length,
      maxCharacters,
      remainingCharacters: Math.max(maxCharacters - text.length, 0),
    };
  }

  async getHermesStatus(memoryPath: string) {
    return this.getFileStatus(memoryPath, this.budget.memoryMaxCharacters);
  }

  canAppend(currentCharacters: number, addition: string, maxCharacters: number) {
    return currentCharacters + addition.length <= maxCharacters;
  }

  summarizeToBudget(text: string, maxCharacters = this.budget.contextMaxCharacters) {
    if (text.length <= maxCharacters) {
      return text;
    }

    const head = text.slice(0, Math.floor(maxCharacters * 0.68)).trim();
    const tail = text.slice(Math.max(text.length - Math.floor(maxCharacters * 0.2), 0)).trim();
    return `${head}\n\n[中间内容已压缩，保留只读摘要]\n\n${tail}`.slice(0, maxCharacters);
  }
}
