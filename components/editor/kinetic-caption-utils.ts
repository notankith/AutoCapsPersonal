export interface KineticWord {
  text: string;
  startSec: number;
  endSec: number;
}

export const MAX_WORDS_PER_SENTENCE = 3;
export const COLOR_CYCLE = ["blue", "yellow", "green"] as const;

export interface KineticSentence {
  startWordIndex: number;
  endWordIndex: number;
}

export function chunkWordsIntoSentences(words: KineticWord[], maxWords = MAX_WORDS_PER_SENTENCE) {
  const sentences: KineticSentence[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    const startWordIndex = i;
    const endWordIndex = Math.min(i + maxWords - 1, words.length - 1);
    sentences.push({ startWordIndex, endWordIndex });
  }
  return { processedWords: words, sentences };
}

export function getSentenceColor(sentenceIndex: number) {
  const group = Math.floor(sentenceIndex / 2) % COLOR_CYCLE.length;
  return COLOR_CYCLE[group];
}
