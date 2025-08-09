import React, { createContext, useContext, useMemo, useRef } from 'react';

const SoundContext = createContext(null);
  navigation: '/sounds/navigation.mp3',
  logout: '/sounds/logout.mp3',
};

export function SoundProvider({ children }) {
  const playersRef = useRef({});

  const playSound = (name) => {
    try {
      const src = SOUND_MAP[name];
      if (!src) return;
      if (!playersRef.current[name]) {
        const audio = new Audio(src);
        audio.preload = 'auto';
        playersRef.current[name] = audio;
      }
      const a = playersRef.current[name];
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {
      // nunca rompas la UI por audio
    }
  };

  const value = useMemo(() => ({ playSound }), []);
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

// ✅ Hook SEGURO: si no hay provider, devolvé un NO-OP en vez de undefined
export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) return { playSound: () => {} };
  return ctx;
}
