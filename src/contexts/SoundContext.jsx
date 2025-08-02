import React, { createContext, useContext, useCallback } from 'react';
import { Howl } from 'howler';

const SoundContext = createContext();

export const useSound = () => {
  return useContext(SoundContext);
};

const sounds = {
  click: '/sounds/click.mp3',
  success: '/sounds/success.mp3',
  error: '/sounds/error.mp3',
  navigation: '/sounds/navigation.mp3',
  login: '/sounds/login.mp3',
  logout: '/sounds/logout.mp3',
  invest: '/sounds/invest.mp3',
  trade: '/sounds/trade.mp3',
  notification: '/sounds/notification.mp3'
};

export const SoundProvider = ({ children }) => {
  const playSound = useCallback((soundName) => {
    if (sounds[soundName]) {
      const sound = new Howl({
        src: [sounds[soundName]],
        volume: 0.3, 
      });
      sound.play();
    }
  }, []);

  return (
    <SoundContext.Provider value={{ playSound }}>
      {children}
    </SoundContext.Provider>
  );
};