"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chunkWordsIntoSentences, getSentenceColor, type KineticWord } from "./kinetic-caption-utils";
import { type OverlayConfig } from "./creator-kinetic-overlay";

export interface KineticTranscriptWord {
  text: string;
  start: number; // milliseconds
  end: number;   // milliseconds
  confidence: number;
  speaker: string;
}

export interface KineticTranscript {
  text: string;
  words: KineticTranscriptWord[];
  audio_duration: number;
}

interface CreatorKineticPlayerProps {
  videoUrl: string;
  transcript: KineticTranscript;
  config: OverlayConfig;
}

type CSSPropertiesWithVars = React.CSSProperties & { [key: string]: string };

const DEFAULT_CONFIG: OverlayConfig = { scale: 1, x: 50, y: 50 };

export function CreatorKineticPlayer({ videoUrl, transcript, config }: CreatorKineticPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lastActiveWordIndex = useRef<number>(-1);
  const lastSentenceIndex = useRef<number>(-1);
  const [responsiveScale, setResponsiveScale] = useState(1);

  const isValidNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && !Number.isNaN(n);

  const normalizedConfig: OverlayConfig = {
    scale: isValidNumber(config?.scale) ? config.scale : DEFAULT_CONFIG.scale,
    x: isValidNumber(config?.x) ? config.x : DEFAULT_CONFIG.x,
    y: isValidNumber(config?.y) ? config.y : DEFAULT_CONFIG.y,
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateScale = () => {
      const width = video.clientWidth;
      if (width > 0) {
        setResponsiveScale(width / 1920);
      }
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(video);
    return () => observer.disconnect();
  }, [videoUrl]);

  const kineticWords = useMemo<KineticWord[]>(() => {
    return transcript.words.map((w) => ({
      text: w.text,
      startSec: w.start / 1000,
      endSec: w.end / 1000,
    }));
  }, [transcript]);

  const { processedWords, sentences } = useMemo(() => chunkWordsIntoSentences(kineticWords), [kineticWords]);

  useEffect(() => {
    lastActiveWordIndex.current = -1;
    lastSentenceIndex.current = -1;
    wordRefs.current = [];
    sentenceRefs.current = [];
  }, [processedWords]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId: number | null = null;

    const updateActiveWord = () => {
      const t = video.currentTime;
      let activeIndex = -1;

      for (let i = 0; i < processedWords.length; i++) {
        const { startSec, endSec } = processedWords[i];
        if (t >= startSec && t < endSec) {
          activeIndex = i;
          break;
        }
      }

      if (activeIndex !== lastActiveWordIndex.current) {
        if (lastActiveWordIndex.current !== -1) {
          const prevEl = wordRefs.current[lastActiveWordIndex.current];
          if (prevEl) {
            prevEl.classList.remove("active", "blue", "yellow", "green");
          }
        }

        if (activeIndex === -1) {
          if (lastSentenceIndex.current !== -1) {
            const prevSentenceEl = sentenceRefs.current[lastSentenceIndex.current];
            if (prevSentenceEl) {
              prevSentenceEl.classList.remove("visible", "zoom-in");
            }
          }
          lastActiveWordIndex.current = -1;
        } else {
          const activeEl = wordRefs.current[activeIndex];
          const sentenceIndex = sentences.findIndex(
            (s) => activeIndex >= s.startWordIndex && activeIndex <= s.endWordIndex
          );

          if (activeEl && sentenceIndex !== -1) {
            const color = getSentenceColor(sentenceIndex);
            activeEl.classList.add("active", color);
          }

          if (sentenceIndex !== lastSentenceIndex.current) {
            if (lastSentenceIndex.current !== -1) {
              const prevSentenceEl = sentenceRefs.current[lastSentenceIndex.current];
              if (prevSentenceEl) {
                prevSentenceEl.classList.remove("visible", "zoom-in");
              }
            }

            const newSentenceEl = sentenceRefs.current[sentenceIndex];
            if (newSentenceEl) {
              newSentenceEl.classList.add("visible");
              newSentenceEl.classList.remove("zoom-in");
              void newSentenceEl.offsetWidth;
              newSentenceEl.classList.add("zoom-in");
            }

            lastSentenceIndex.current = sentenceIndex;
          }

          lastActiveWordIndex.current = activeIndex;
        }
      }

      if (!video.paused && !video.ended) {
        rafId = requestAnimationFrame(updateActiveWord);
      }
    };

    const handlePlay = () => {
      rafId = requestAnimationFrame(updateActiveWord);
    };
    const handlePause = () => updateActiveWord();
    const handleSeeked = () => updateActiveWord();
    const handleEnded = () => {
      if (lastActiveWordIndex.current !== -1) {
        const prevEl = wordRefs.current[lastActiveWordIndex.current];
        if (prevEl) prevEl.classList.remove("active", "blue", "yellow", "green");
      }
      if (lastSentenceIndex.current !== -1) {
        const prevSentenceEl = sentenceRefs.current[lastSentenceIndex.current];
        if (prevSentenceEl) prevSentenceEl.classList.remove("visible", "zoom-in");
      }
      lastActiveWordIndex.current = -1;
      lastSentenceIndex.current = -1;
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("ended", handleEnded);

    updateActiveWord();

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("ended", handleEnded);
    };
  }, [processedWords, sentences]);

  const overlayStyle = useMemo<CSSPropertiesWithVars>(() => {
    const baseFontPx = 58;
    const computedFontSize = baseFontPx * responsiveScale * normalizedConfig.scale;
    return {
      left: `${normalizedConfig.x}%`,
      top: `${normalizedConfig.y}%`,
      transform: `translate(-50%, -50%) scale(${normalizedConfig.scale})`,
      "--caption-font-size": `${computedFontSize}px`,
    };
  }, [normalizedConfig, responsiveScale]);

  return (
    <div className="player-wrapper">
      <style jsx>{`
        @font-face {
          font-family: "TheBoldFont";
          src: url("/fonts/THEBOLDFONT-FREEVERSION.ttf") format("truetype");
          font-weight: normal;
          font-style: normal;
        }

        .player-wrapper {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000;
          overflow: hidden;
          border-radius: 12px;
        }

        video {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .captions-overlay {
          position: absolute;
          width: auto;
          min-width: 200px;
          pointer-events: none;
          text-align: center;
          text-transform: uppercase;
          font-size: var(--caption-font-size);
          font-family: "TheBoldFont", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          line-height: 1.1;
        }

        .sentence {
          display: none;
          white-space: pre-wrap;
          transform-origin: center center;
        }

        .sentence.visible {
          display: inline-block;
        }

        .sentence.zoom-in {
          animation: sentence-zoom 0.3s ease-out;
        }

        @keyframes sentence-zoom {
          0% {
            transform: scale(0.9);
          }
          100% {
            transform: scale(1);
          }
        }

        .word {
          position: relative;
          display: inline-block;
          color: #ffffff;
          text-shadow:
            0 0 calc(2px * ${responsiveScale}) #000,
            0 0 calc(4px * ${responsiveScale}) #000,
            0 0 calc(6px * ${responsiveScale}) rgba(0, 0, 0, 0.85),
            0 0 calc(3px * ${responsiveScale}) #ffffffaa,
            0 0 calc(6px * ${responsiveScale}) #ffffffaa,
            0 0 calc(12px * ${responsiveScale}) #ffffffaa;
        }

        .word + .word {
          margin-left: 0.14em;
        }

        .word.active {
          text-shadow:
            0 0 calc(2px * ${responsiveScale}) #000,
            0 0 calc(4px * ${responsiveScale}) #000,
            0 0 calc(8px * ${responsiveScale}) rgba(0, 0, 0, 0.95),
            0 0 calc(6px * ${responsiveScale}) currentColor,
            0 0 calc(12px * ${responsiveScale}) currentColor;
        }

        .word.active.blue { color: #70e2ff; }
        .word.active.yellow { color: #ffe83f; }
        .word.active.green { color: #9fff5b; }
      `}</style>

      <video ref={videoRef} controls crossOrigin="anonymous">
        <source src={videoUrl} type="video/mp4" />
      </video>

      <div className="captions-overlay" style={overlayStyle}>
        {sentences.map((sentence, sIdx) => (
          <span
            key={sIdx}
            className="sentence"
            ref={(el) => {
              sentenceRefs.current[sIdx] = el;
            }}
          >
            {processedWords
              .slice(sentence.startWordIndex, sentence.endWordIndex + 1)
              .map((word, wIdx) => {
                const globalIndex = sentence.startWordIndex + wIdx;
                return (
                  <span
                    key={globalIndex}
                    className="word"
                    data-index={globalIndex}
                    data-start={word.startSec}
                    data-end={word.endSec}
                    ref={(el) => {
                      wordRefs.current[globalIndex] = el;
                    }}
                  >
                    {word.text}
                  </span>
                );
              })}
          </span>
        ))}
      </div>
    </div>
  );
}
