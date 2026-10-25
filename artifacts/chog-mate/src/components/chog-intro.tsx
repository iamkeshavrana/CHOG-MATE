import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import './chog-intro.css';

const INTRO_SESSION_KEY = 'chog-mate-intro-seen';
const SCENE_DURATION = 650;
const FINAL_HOLD_DURATION = 1_200;
const EXIT_DURATION = 450;

type IntroScene = 'meet' | 'match' | 'chog' | 'final';

const sceneCopy: Record<IntroScene, string> = {
  meet: 'MEET',
  match: 'MATCH',
  chog: 'CHOG',
  final: 'CHOG MATE. Your Chog. Your Match.',
};

export function ChogIntro() {
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);
  const [scene, setScene] = useState<IntroScene>('meet');
  const [isExiting, setIsExiting] = useState(false);
  const startedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const dismissTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (location !== '/' || startedRef.current) return;

    try {
      if (window.sessionStorage.getItem(INTRO_SESSION_KEY)) {
        startedRef.current = true;
        return;
      }
      window.sessionStorage.setItem(INTRO_SESSION_KEY, '1');
    } catch {
      // Storage can be unavailable in privacy modes; the intro remains usable.
    }

    startedRef.current = true;
    setVisible(true);

    let mediaQuery: MediaQueryList | undefined;

    const finish = () => {
      timersRef.current.forEach(window.clearTimeout);
      timersRef.current = [];
      setIsExiting(true);
      dismissTimerRef.current = window.setTimeout(() => setVisible(false), EXIT_DURATION);
    };

    const startSequence = (reducedMotion: boolean) => {
      if (reducedMotion) {
        setScene('final');
        dismissTimerRef.current = window.setTimeout(finish, 700);
        return;
      }

      timersRef.current = [
        window.setTimeout(() => setScene('match'), SCENE_DURATION),
        window.setTimeout(() => setScene('chog'), SCENE_DURATION * 2),
        window.setTimeout(() => setScene('final'), SCENE_DURATION * 3),
        window.setTimeout(finish, SCENE_DURATION * 3 + FINAL_HOLD_DURATION),
      ];
    };

    try {
      mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      startSequence(mediaQuery.matches);
    } catch {
      startSequence(false);
    }

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        timersRef.current.forEach(window.clearTimeout);
        timersRef.current = [];
        if (dismissTimerRef.current !== undefined) window.clearTimeout(dismissTimerRef.current);
        setScene('final');
        dismissTimerRef.current = window.setTimeout(finish, 700);
      }
    };

    mediaQuery?.addEventListener?.('change', handleReducedMotionChange);

    return () => {
      timersRef.current.forEach(window.clearTimeout);
      timersRef.current = [];
      if (dismissTimerRef.current !== undefined) {
        window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = undefined;
      }
      mediaQuery?.removeEventListener?.('change', handleReducedMotionChange);
    };
  }, [location]);

  useEffect(() => {
    if (location !== '/' && visible) {
      setIsExiting(true);
      const timeout = window.setTimeout(() => setVisible(false), EXIT_DURATION);
      return () => window.clearTimeout(timeout);
    }

    return undefined;
  }, [location, visible]);

  if (!visible) return null;

  const isFinal = scene === 'final';

  return (
    <div
      className={`chog-intro${isExiting ? ' chog-intro--leaving' : ''}`}
      aria-label="CHOG MATE brand introduction"
      data-testid="intro-overlay"
    >
      <div className="chog-intro__light chog-intro__light--one" aria-hidden="true" />
      <div className="chog-intro__light chog-intro__light--two" aria-hidden="true" />
      <div className="chog-intro__streak chog-intro__streak--one" aria-hidden="true" />
      <div className="chog-intro__streak chog-intro__streak--two" aria-hidden="true" />

      <div className="chog-intro__frame">
        <div className="chog-intro__topline" aria-hidden="true">
          <span>CHOG MATE</span>
          <span>VERIFIED CONNECTIONS</span>
        </div>

        <div
          className={`chog-intro__stage${isFinal ? ' chog-intro__stage--final' : ''}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="intro-content"
        >
          {isFinal ? (
            <div className="chog-intro__lockup">
              <span className="chog-intro__brand-word">CHOG</span>
              <span className="chog-intro__brand-word chog-intro__brand-word--mate">MATE</span>
              <span className="chog-intro__subtitle">Your Chog. Your Match.</span>
            </div>
          ) : (
            <span key={scene} className="chog-intro__word">
              {sceneCopy[scene]}
            </span>
          )}
        </div>

        <div className="chog-intro__bottomline">
          <span className="chog-intro__sequence" aria-hidden="true">
            <i className={scene === 'meet' ? 'is-active' : ''} />
            <i className={scene === 'match' ? 'is-active' : ''} />
            <i className={scene === 'chog' ? 'is-active' : ''} />
            <i className={isFinal ? 'is-active' : ''} />
          </span>
          <button
            type="button"
            className="chog-intro__skip"
            onClick={() => {
              timersRef.current.forEach(window.clearTimeout);
              timersRef.current = [];
              if (dismissTimerRef.current !== undefined) {
                window.clearTimeout(dismissTimerRef.current);
              }
              setIsExiting(true);
              dismissTimerRef.current = window.setTimeout(() => setVisible(false), EXIT_DURATION);
            }}
            data-testid="button-skip-intro"
          >
            Skip intro
          </button>
        </div>
      </div>
    </div>
  );
}
